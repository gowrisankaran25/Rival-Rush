import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { clamp, damp, lerp, steeringFromHands } from '../game/math';
import type { ControlInput } from '../game/types';
import {
  isClosedHand,
  isIndexExtended,
  isOpenPalm,
  isThumbUp,
  SustainedGesture,
} from './handGestures';
import type { HandTrackingResult, HandWorkerInput, HandWorkerOutput } from './handWorkerTypes';

type TrackingStatus = 'idle' | 'loading' | 'ready' | 'calibrating' | 'tracking' | 'lost' | 'error';
const INFERENCE_INTERVAL_MS = 1000 / 30;
const PREVIEW_INTERVAL_MS = 1000 / 30;
const DROPOUT_GRACE_MS = 1200;
const CALIBRATION_FRAMES = 10;
const HAND_POINT_COLORS = [
  '#ecff76',
  '#ffb866',
  '#ffb866',
  '#ffb866',
  '#ffb866',
  '#55e8ff',
  '#55e8ff',
  '#55e8ff',
  '#55e8ff',
  '#72ffad',
  '#72ffad',
  '#72ffad',
  '#72ffad',
  '#d98cff',
  '#d98cff',
  '#d98cff',
  '#d98cff',
  '#ff7f9f',
  '#ff7f9f',
  '#ff7f9f',
  '#ff7f9f',
] as const;
const FINGERTIP_INDICES = new Set([4, 8, 12, 16, 20]);
const BRAKE_GESTURE_HOLD_MS = 180;

export class HandController {
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private worker: Worker | null = null;
  private raf = 0;
  private videoFrameCallback = 0;
  private lastVideoTime = -1;
  private lastInferenceTime = 0;
  private frameInFlight = false;
  private switchingToFallback = false;
  private cancelWorkerInitialization: (() => void) | null = null;
  private neutralAngle = 0;
  private calibrationAngles: number[] = [];
  private input: ControlInput = { steering: 0, confidence: 0, active: false };
  private readonly brakeGesture = new SustainedGesture(BRAKE_GESTURE_HOLD_MS);
  private wasRightIndexExtended = false;
  private wasLeftIndexExtended = false;
  private lastGearShiftTime = 0;
  private pendingGearShift?: 1 | -1;
  private status: TrackingStatus = 'idle';
  private lastSeen = 0;
  private previewVisible = true;
  private lastPreviewTime = 0;
  private previewContext: CanvasRenderingContext2D | null = null;
  private paused = false;
  private stopped = false;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly onStatus: (status: TrackingStatus, progress?: number) => void,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.setStatus('loading');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      if (this.stopped) return;

      const wasmRoot = new URL(`${import.meta.env.BASE_URL}mediapipe/wasm`, window.location.href)
        .href;
      const localModel = new URL(
        `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`,
        window.location.href,
      ).href;
      try {
        await this.startWorker(wasmRoot, localModel);
      } catch (workerError) {
        if (this.stopped) return;
        console.warn('Hand tracking worker unavailable; using main-thread fallback.', workerError);
        await this.initializeMainThreadLandmarker(wasmRoot, localModel);
      }
      if (this.stopped) {
        this.landmarker?.close();
        this.landmarker = null;
        this.worker?.terminate();
        this.worker = null;
        return;
      }
      this.setStatus('ready');
      this.beginCalibration();
      this.scheduleNextFrame();
    } catch (error) {
      if (this.stopped) return;
      console.warn('Hand tracking unavailable:', error);
      this.setStatus('error');
      throw error;
    }
  }

  private async startWorker(wasmRoot: string, modelAssetPath: string): Promise<void> {
    if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') {
      throw new Error('Required worker camera APIs are unavailable.');
    }

    const worker = new Worker(new URL('./handTracking.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker = worker;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('Hand tracking worker initialization timed out.')),
        20_000,
      );
      this.cancelWorkerInitialization = (): void => {
        window.clearTimeout(timeout);
        reject(new Error('Hand tracking worker initialization was cancelled.'));
      };
      worker.onmessage = (event: MessageEvent<HandWorkerOutput>): void => {
        if (event.data.type === 'ready') {
          window.clearTimeout(timeout);
          resolve();
        } else if (event.data.type === 'error') {
          window.clearTimeout(timeout);
          reject(new Error(event.data.message));
        }
      };
      worker.onerror = (event): void => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'The hand tracking worker failed to start.'));
      };
      const message: HandWorkerInput = { type: 'init', wasmRoot, modelAssetPath };
      worker.postMessage(message);
    })
      .catch((error) => {
        worker.terminate();
        if (this.worker === worker) this.worker = null;
        throw error;
      })
      .finally(() => {
        this.cancelWorkerInitialization = null;
      });

    worker.onmessage = this.handleWorkerMessage;
    worker.onerror = (event): void => {
      void this.activateMainThreadFallback(
        new Error(event.message || 'Hand tracking worker stopped.'),
      );
    };
  }

  private async initializeMainThreadLandmarker(
    wasmRoot: string,
    localModel: string,
  ): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(wasmRoot);
    try {
      this.landmarker = await this.createLandmarker(vision, localModel, 'GPU');
    } catch {
      try {
        this.landmarker = await this.createLandmarker(vision, localModel, 'CPU');
      } catch {
        this.landmarker = await this.createLandmarker(
          vision,
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          'CPU',
        );
      }
    }
  }

  private createLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    modelAssetPath: string,
    delegate: 'GPU' | 'CPU',
  ) {
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    });
  }

  beginCalibration(): void {
    this.calibrationAngles = [];
    this.resetBrakeGesture();
    this.setStatus('calibrating', 0);
  }

  getInput(): ControlInput {
    if (performance.now() - this.lastSeen > 1200) {
      this.resetBrakeGesture();
      return { steering: 0, confidence: 0, active: false };
    }
    const gearShift = this.pendingGearShift;
    this.pendingGearShift = undefined;
    return {
      ...this.input,
      gearShift,
    };
  }

  getStatus(): TrackingStatus {
    return this.status;
  }

  togglePreview(): boolean {
    this.previewVisible = !this.previewVisible;
    const shell = this.canvas.closest('.camera-shell');
    shell?.classList.toggle('is-hidden', !this.previewVisible);
    return this.previewVisible;
  }

  stop(): void {
    this.stopped = true;
    this.resetBrakeGesture();
    this.cancelWorkerInitialization?.();
    this.cancelWorkerInitialization = null;
    cancelAnimationFrame(this.raf);
    if (this.videoFrameCallback) this.video.cancelVideoFrameCallback(this.videoFrameCallback);
    this.worker?.terminate();
    this.worker = null;
    this.frameInFlight = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.landmarker?.close();
    this.landmarker = null;
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused || this.stopped) return;
    this.paused = paused;
    if (paused) {
      this.resetBrakeGesture();
      cancelAnimationFrame(this.raf);
      if (this.videoFrameCallback) {
        this.video.cancelVideoFrameCallback(this.videoFrameCallback);
        this.videoFrameCallback = 0;
      }
    } else {
      this.lastVideoTime = -1;
      this.scheduleNextFrame();
    }
  }

  private scheduleNextFrame(): void {
    if (this.stopped || this.paused) return;
    if (typeof this.video.requestVideoFrameCallback === 'function') {
      this.videoFrameCallback = this.video.requestVideoFrameCallback(this.processVideoFrame);
    } else {
      this.raf = requestAnimationFrame(this.processAnimationFrame);
    }
  }

  private processVideoFrame = (now: DOMHighResTimeStamp): void => {
    this.processFrame(now);
    this.scheduleNextFrame();
  };

  private processAnimationFrame = (now: DOMHighResTimeStamp): void => {
    this.processFrame(now);
    this.scheduleNextFrame();
  };

  private processFrame(now: DOMHighResTimeStamp): void {
    if (this.video.paused && this.video.readyState >= 2) {
      void this.video.play().catch(() => {});
    }
    if (
      this.stopped ||
      this.paused ||
      this.video.readyState < 2 ||
      this.video.currentTime === this.lastVideoTime ||
      now - this.lastInferenceTime < INFERENCE_INTERVAL_MS
    )
      return;
    this.lastVideoTime = this.video.currentTime;
    this.lastInferenceTime = now;

    if (this.worker) {
      if (this.frameInFlight) return;
      this.frameInFlight = true;
      void createImageBitmap(this.video)
        .then((frame) => {
          if (this.stopped || !this.worker) {
            frame.close();
            this.frameInFlight = false;
            return;
          }
          const message: HandWorkerInput = { type: 'frame', frame, timestamp: now };
          this.worker.postMessage(message, [frame]);
        })
        .catch((error) => {
          this.frameInFlight = false;
          void this.activateMainThreadFallback(error);
        });
      return;
    }

    if (this.landmarker) {
      const result = this.serializeResult(this.landmarker.detectForVideo(this.video, now));
      this.consumeResult(result);
      this.drawPreview(result);
    }
  }

  private handleWorkerMessage = (event: MessageEvent<HandWorkerOutput>): void => {
    if (event.data.type === 'result') {
      this.frameInFlight = false;
      this.consumeResult(event.data.result);
      this.drawPreview(event.data.result);
    } else if (event.data.type === 'error') {
      this.frameInFlight = false;
      void this.activateMainThreadFallback(new Error(event.data.message));
    }
  };

  private async activateMainThreadFallback(reason: unknown): Promise<void> {
    if (this.switchingToFallback || this.stopped || this.landmarker) return;
    this.switchingToFallback = true;
    console.warn('Switching hand tracking to the main-thread fallback.', reason);
    this.worker?.terminate();
    this.worker = null;
    this.frameInFlight = false;
    try {
      const wasmRoot = new URL(`${import.meta.env.BASE_URL}mediapipe/wasm`, window.location.href)
        .href;
      const localModel = new URL(
        `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`,
        window.location.href,
      ).href;
      await this.initializeMainThreadLandmarker(wasmRoot, localModel);
    } catch (error) {
      console.warn('Main-thread hand tracking fallback failed.', error);
      this.input.active = false;
      this.setStatus('error');
    } finally {
      this.switchingToFallback = false;
    }
  }

  private serializeResult(result: HandLandmarkerResult): HandTrackingResult {
    return {
      landmarks: result.landmarks.map((hand) =>
        hand.map((point) => ({
          x: point.x,
          y: point.y,
          z: point.z,
        })),
      ),
      handednessScores: result.handedness.map((categories) => categories[0]?.score ?? 0.7),
    };
  }

  private consumeResult(result: HandTrackingResult): void {
    const now = performance.now();
    if (result.landmarks.length === 0) {
      if (now - this.lastSeen > DROPOUT_GRACE_MS) {
        this.resetBrakeGesture();
        this.input = {
          steering: damp(this.input.steering, 0, 10, 1 / 30),
          confidence: 0,
          active: false,
        };
        if (this.status === 'tracking') this.setStatus('lost');
      } else if (this.status === 'tracking') {
        // Momentary dropout within grace window: sustain momentum and gently center steering
        this.input = {
          ...this.input,
          steering: damp(this.input.steering, 0, 3, 1 / 30),
          confidence: Math.max(0.4, (this.input.confidence ?? 0.7) * 0.9),
          active: true,
          accelerating: true,
        };
      }
      return;
    }

    this.lastSeen = now;

    if (result.landmarks.length === 1) {
      // Single-hand driving: smooth fallback so car keeps driving without sudden auto-braking
      const handLandmarks = result.landmarks[0];
      const wrist = handLandmarks[0];
      const middleMcp = handLandmarks[9];
      const palm = {
        x: (wrist.x + middleMcp.x) * 0.5,
        y: (wrist.y + middleMcp.y) * 0.5,
      };
      // Moving hand left/right across webcam view steers the vehicle
      const lateralOffset = palm.x - 0.5;
      const wristTilt = Math.atan2(middleMcp.x - wrist.x, -(middleMcp.y - wrist.y));
      const rawSteering = clamp(-lateralOffset * 2.5 + wristTilt * 0.8, -1, 1);
      const smoothedSteering = damp(this.input.steering, rawSteering, 22.0, 1 / 30);
      const score = result.handednessScores[0] ?? 0.7;

      const thumbBrake = isThumbUp(handLandmarks);
      const braking = this.brakeGesture.update(thumbBrake, this.lastSeen);

      // Single-hand paddle shift
      const indexExt = isIndexExtended(handLandmarks);
      if (indexExt && !this.wasRightIndexExtended && now - this.lastGearShiftTime > 280) {
        this.pendingGearShift = palm.x < 0.5 ? 1 : -1;
        this.lastGearShiftTime = now;
      }
      this.wasRightIndexExtended = indexExt;

      this.input = {
        steering: smoothedSteering,
        confidence: score,
        active: true,
        accelerating: !braking,
        braking: braking ? true : undefined,
        brakePressure: braking ? 1 : undefined,
      };
      if (this.status !== 'tracking') this.setStatus('tracking');
      return;
    }

    const hands = result.landmarks
      .slice(0, 2)
      .map((landmarks, index) => {
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];
        const palm = {
          x: (wrist.x + middleMcp.x) * 0.5,
          y: (wrist.y + middleMcp.y) * 0.5,
        };
        return {
          landmarks,
          wrist,
          palm,
          closed: isClosedHand(landmarks),
          openPalm: isOpenPalm(landmarks),
          thumbUp: isThumbUp(landmarks),
          score: result.handednessScores[index] ?? 0.7,
        };
      })
      .sort((a, b) => a.palm.x - b.palm.x);

    const separation = Math.hypot(
      hands[1].palm.x - hands[0].palm.x,
      hands[1].palm.y - hands[0].palm.y,
    );
    // Two distinct hands must be in camera view
    if (separation < 0.08) {
      if (now - this.lastSeen > DROPOUT_GRACE_MS) {
        this.resetBrakeGesture();
        this.input.active = false;
        if (this.status === 'tracking') this.setStatus('lost');
      }
      return;
    }

    // Palm center angle yields far smoother steering than wrist alone
    const angle = Math.atan2(hands[1].palm.y - hands[0].palm.y, hands[1].palm.x - hands[0].palm.x);
    const confidence = Math.min(hands[0].score, hands[1].score);

    // Precise, linear steering response with minimal deadzone for micro-tremors
    const raw = -steeringFromHands(hands[0].palm, hands[1].palm, this.neutralAngle, 0.025, 1.0);

    // Deliberate brake gesture: thumbs raised upward (thumb-up)
    // Natural open palm or fist grip drives and accelerates smoothly!
    const thumbBraking = hands.some((hand) => hand.thumbUp);
    const rawBrakePressure = thumbBraking ? 1 : 0;
    const braking = this.brakeGesture.update(rawBrakePressure > 0, this.lastSeen);

    // Fast, responsive adaptive smoothing
    const steeringDelta = Math.abs(raw - this.input.steering);
    const adaptiveLambda = lerp(20.0, 34.0, clamp((steeringDelta - 0.04) / 0.25, 0, 1));
    const smoothedSteering = damp(this.input.steering, raw, adaptiveLambda, 1 / 30);

    if (this.status === 'calibrating') {
      this.resetBrakeGesture();
      this.calibrationAngles.push(angle);
      const progress = Math.min(1.0, this.calibrationAngles.length / CALIBRATION_FRAMES);
      this.onStatus('calibrating', progress);
      this.neutralAngle = this.circularAverage(this.calibrationAngles);

      // Immediately provide active throttle and steering while calibration collects frames,
      // so the car is responsive without any start-up lag!
      this.input = {
        steering: smoothedSteering,
        confidence,
        active: true,
        accelerating: !braking,
        braking: braking ? true : undefined,
        brakePressure: braking ? rawBrakePressure : undefined,
      };

      if (this.calibrationAngles.length >= CALIBRATION_FRAMES) {
        this.setStatus('tracking');
      }
      return;
    }

    // Paddle Shifter Gear Control Gestures:
    // hands[0] = User's RIGHT hand in camera coordinates (smaller x in unmirrored feed)
    // hands[1] = User's LEFT hand in camera coordinates (larger x in unmirrored feed)
    const rightIndex = isIndexExtended(hands[0].landmarks);
    const leftIndex = isIndexExtended(hands[1].landmarks);

    if (rightIndex && !this.wasRightIndexExtended && now - this.lastGearShiftTime > 280) {
      this.pendingGearShift = 1;
      this.lastGearShiftTime = now;
    } else if (leftIndex && !this.wasLeftIndexExtended && now - this.lastGearShiftTime > 280) {
      this.pendingGearShift = -1;
      this.lastGearShiftTime = now;
    }

    this.wasRightIndexExtended = rightIndex;
    this.wasLeftIndexExtended = leftIndex;

    this.input = {
      steering: smoothedSteering,
      confidence,
      active: true,
      accelerating: !braking, // Direct manual throttle while driving
      braking: braking ? true : undefined,
      brakePressure: braking ? rawBrakePressure : undefined,
    };
    if (this.status !== 'tracking') this.setStatus('tracking');
  }

  private resetBrakeGesture(): void {
    this.brakeGesture.reset();
    this.wasRightIndexExtended = false;
    this.wasLeftIndexExtended = false;
    this.pendingGearShift = undefined;
  }

  private circularAverage(values: number[]): number {
    const sin = values.reduce((sum, angle) => sum + Math.sin(angle), 0);
    const cos = values.reduce((sum, angle) => sum + Math.cos(angle), 0);
    return Math.atan2(sin, cos);
  }

  private drawPreview(result: HandTrackingResult): void {
    const shell = this.canvas.closest('.camera-shell');
    const now = performance.now();
    if (
      !this.previewVisible ||
      shell?.classList.contains('is-hidden') ||
      now - this.lastPreviewTime < PREVIEW_INTERVAL_MS
    )
      return;
    this.lastPreviewTime = now;

    const width = this.video.videoWidth || 640;
    const height = this.video.videoHeight || 480;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.previewContext ??= this.canvas.getContext('2d');
    const context = this.previewContext;
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);

    if (result.landmarks.length === 2) {
      // Use palm center for visualization
      const hand0Palm = {
        x: (result.landmarks[0][0].x + result.landmarks[0][9].x) * 0.5,
        y: (result.landmarks[0][0].y + result.landmarks[0][9].y) * 0.5,
      };
      const hand1Palm = {
        x: (result.landmarks[1][0].x + result.landmarks[1][9].x) * 0.5,
        y: (result.landmarks[1][0].y + result.landmarks[1][9].y) * 0.5,
      };
      const leftX = hand0Palm.x * width;
      const leftY = hand0Palm.y * height;
      const rightX = hand1Palm.x * width;
      const rightY = hand1Palm.y * height;
      const centerX = (leftX + rightX) * 0.5;
      const centerY = (leftY + rightY) * 0.5;

      context.save();
      context.setLineDash([8, 6]);
      context.lineWidth = 2.5;
      context.strokeStyle = 'rgba(236, 255, 118, 0.88)';
      context.beginPath();
      context.moveTo(leftX, leftY);
      context.lineTo(rightX, rightY);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#ecff76';
      context.strokeStyle = 'rgba(5, 12, 16, 0.9)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(centerX, centerY, 8, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }

    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const hand of result.landmarks) {
      for (const connection of HandLandmarker.HAND_CONNECTIONS) {
        const a = connection.start;
        const b = connection.end;
        const startX = hand[a].x * width;
        const startY = hand[a].y * height;
        const endX = hand[b].x * width;
        const endY = hand[b].y * height;

        context.strokeStyle = 'rgba(3, 10, 14, 0.78)';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();

        context.strokeStyle = HAND_POINT_COLORS[b] ?? HAND_POINT_COLORS[0];
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
      }

      for (let index = 0; index < hand.length; index += 1) {
        const point = hand[index];
        // Keep landmarks subtle so the camera feed remains readable, while
        // retaining slightly larger wrist and fingertip anchors.
        const radius = index === 0 ? 3.5 : FINGERTIP_INDICES.has(index) ? 3 : 2;
        const x = point.x * width;
        const y = point.y * height;

        context.fillStyle = 'rgba(3, 10, 14, 0.9)';
        context.beginPath();
        context.arc(x, y, radius + 1, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = HAND_POINT_COLORS[index] ?? HAND_POINT_COLORS[0];
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  private setStatus(status: TrackingStatus, progress?: number): void {
    this.status = status;
    this.onStatus(status, progress);
  }
}
