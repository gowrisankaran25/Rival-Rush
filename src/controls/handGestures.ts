import type { HandPoint } from './handWorkerTypes';

const pointDistance = (a: HandPoint, b: HandPoint): number => Math.hypot(a.x - b.x, a.y - b.y);
const projectOntoAxis = (from: HandPoint, to: HandPoint, axisX: number, axisY: number): number =>
  (to.x - from.x) * axisX + (to.y - from.y) * axisY;
const distanceFromAxis = (from: HandPoint, to: HandPoint, axisX: number, axisY: number): number =>
  Math.abs((to.x - from.x) * axisY - (to.y - from.y) * axisX);
const THUMB_UP_LIFT = 0.55;

export class SustainedGesture {
  private detectedSince: number | null = null;

  constructor(private readonly holdDurationMs: number) {}

  update(detected: boolean, now: number): boolean {
    if (!detected) {
      this.reset();
      return false;
    }

    this.detectedSince ??= now;
    return now - this.detectedSince >= this.holdDurationMs;
  }

  reset(): void {
    this.detectedSince = null;
  }
}

export function isClosedHand(landmarks: HandPoint[]): boolean {
  if (landmarks.length < 21) return false;
  const wrist = landmarks[0];
  const tips = [8, 12, 16, 20];
  const mcps = [5, 9, 13, 17];
  let folded = 0;
  for (let index = 0; index < tips.length; index += 1) {
    const tipDistance = pointDistance(landmarks[tips[index]], wrist);
    const mcpDistance = pointDistance(landmarks[mcps[index]], wrist);
    if (tipDistance < mcpDistance * 1.58) folded += 1;
  }
  return folded >= 3;
}

export function isOpenPalm(landmarks: HandPoint[]): boolean {
  if (landmarks.length < 21) return false;
  const wrist = landmarks[0];
  const tips = [8, 12, 16, 20];
  const mcps = [5, 9, 13, 17];
  let extended = 0;
  for (let index = 0; index < tips.length; index += 1) {
    const tipDistance = pointDistance(landmarks[tips[index]], wrist);
    const mcpDistance = pointDistance(landmarks[mcps[index]], wrist);
    if (tipDistance > mcpDistance * 1.65) extended += 1;
  }
  return extended === 4;
}

export function isThumbUp(landmarks: HandPoint[]): boolean {
  if (landmarks.length < 21) return false;
  if (isIndexExtended(landmarks)) return false;

  const wrist = landmarks[0];
  const indexTip = landmarks[8];
  const indexMcp = landmarks[5];
  // Index must remain folded to qualify as a brake fist gesture
  if (pointDistance(indexTip, wrist) > pointDistance(indexMcp, wrist) * 1.35) return false;

  if (!isClosedHand(landmarks)) return false;

  const thumbMcp = landmarks[2];
  const thumbIp = landmarks[3];
  const thumbTip = landmarks[4];
  const middleMcp = landmarks[9];
  const handScale = pointDistance(wrist, middleMcp);
  if (handScale <= 0) return false;

  // Measure lift in the hand's local coordinate system. The palm axis rotates
  // with steering, so brake pressure does not depend on screen orientation.
  const axisX = (middleMcp.x - wrist.x) / handScale;
  const axisY = (middleMcp.y - wrist.y) / handScale;
  const proximalRise = projectOntoAxis(thumbMcp, thumbIp, axisX, axisY);
  const distalRise = projectOntoAxis(thumbIp, thumbTip, axisX, axisY);
  const totalRise = projectOntoAxis(thumbMcp, thumbTip, axisX, axisY);
  const lateralDrift = distanceFromAxis(thumbMcp, thumbTip, axisX, axisY);
  const knuckleFront = Math.max(
    projectOntoAxis(wrist, landmarks[5], axisX, axisY),
    projectOntoAxis(wrist, landmarks[17], axisX, axisY),
  );
  const tipClearance = projectOntoAxis(wrist, thumbTip, axisX, axisY) - knuckleFront;

  const normalizedLift = totalRise / handScale;
  const normalizedTipClearance = tipClearance / handScale;

  return (
    normalizedLift >= THUMB_UP_LIFT &&
    proximalRise > handScale * 0.15 &&
    distalRise > handScale * 0.22 &&
    normalizedTipClearance >= 0.12 &&
    lateralDrift < totalRise * 0.65
  );
}

/**
 * Detects whether the hand is making a paddle shifter / gear control gesture:
 * the index finger is extended while the other fingers remain folded on the steering wheel.
 */
export function isIndexExtended(landmarks: HandPoint[]): boolean {
  if (landmarks.length < 21) return false;
  // If the hand is an open palm, it is general steering or braking, not a paddle shift gesture
  if (isOpenPalm(landmarks)) return false;

  const wrist = landmarks[0];
  const indexTip = landmarks[8];
  const indexMcp = landmarks[5];
  const middleTip = landmarks[12];
  const middleMcp = landmarks[9];
  const ringTip = landmarks[16];
  const ringMcp = landmarks[13];
  const pinkyTip = landmarks[20];
  const pinkyMcp = landmarks[17];

  const indexTipDist = pointDistance(indexTip, wrist);
  const indexMcpDist = pointDistance(indexMcp, wrist);

  // Index must be clearly extended away from wrist
  if (indexTipDist < indexMcpDist * 1.45) return false;

  // Middle, ring, and pinky must remain folded in the steering grip
  const middleTipDist = pointDistance(middleTip, wrist);
  const middleMcpDist = pointDistance(middleMcp, wrist);
  const ringTipDist = pointDistance(ringTip, wrist);
  const ringMcpDist = pointDistance(ringMcp, wrist);
  const pinkyTipDist = pointDistance(pinkyTip, wrist);
  const pinkyMcpDist = pointDistance(pinkyMcp, wrist);

  let foldedCount = 0;
  if (middleTipDist < middleMcpDist * 1.55) foldedCount += 1;
  if (ringTipDist < ringMcpDist * 1.55) foldedCount += 1;
  if (pinkyTipDist < pinkyMcpDist * 1.55) foldedCount += 1;

  // At least 2 of the other 3 fingers must be clearly folded
  if (foldedCount < 2) return false;

  // Index must extend significantly further than middle, ring, and pinky
  if (indexTipDist <= middleTipDist * 1.2) return false;
  if (indexTipDist <= ringTipDist * 1.22) return false;
  if (indexTipDist <= pinkyTipDist * 1.22) return false;

  return true;
}
