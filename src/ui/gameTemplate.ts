import { TRAFFIC_COUNT_OPTIONS } from '../game/config';
import {
  CAR_MODEL_OPTIONS,
  CAR_MODEL_VARIETY_OPTIONS,
  DEFAULT_CAR_MODEL_ID,
} from '../game/vehicleCatalog';

/** Builds the static application shell. Dynamic overlays remain in the app controller. */
export function createGameTemplate(): string {
  const loadingPosterPath = `${import.meta.env.BASE_URL}images/driftline-poster-loading.webp`;
  const carOptions = CAR_MODEL_OPTIONS.map(
    ({ id, label }) =>
      `<option value="${id}"${id === DEFAULT_CAR_MODEL_ID ? ' selected' : ''}>${label}</option>`,
  ).join('');
  const trafficOptions = TRAFFIC_COUNT_OPTIONS.map(
    (count) =>
      `<option value="${count}"${count === 4 ? ' selected' : ''}>${count === 0 ? 'NO TRAFFIC' : `${count} CARS`}</option>`,
  ).join('');
  const varietyOptions = CAR_MODEL_VARIETY_OPTIONS.map(
    (count) =>
      `<option value="${count}"${count === 1 ? ' selected' : ''}>${count} ${count === 1 ? 'MODEL' : 'MODELS'}</option>`,
  ).join('');

  return `
    <main class="game-shell">
      <div id="viewport" class="viewport" aria-label="3D driving game"></div>

      <header class="topbar">
        <a class="brand" href="#" aria-label="Rival Rush home">
          <span class="brand-mark"></span><span>RIVAL RUSH</span>
        </a>
        <div class="topbar-actions">
          <div id="tracking-pill" class="tracking-pill">
            <span class="status-dot"></span><span id="tracking-label">INPUT NOT SET</span>
          </div>
          <button id="camera-button" class="icon-button" aria-label="Change camera view angle (C)"><span class="camera-button-label">CAM: FRONT ROAD</span><span class="camera-button-label-compact">CAM</span></button>
          <button id="weather-button" class="icon-button" aria-label="Change weather condition"><span class="weather-button-label">WEATHER: AUTO</span><span class="weather-button-label-compact">WTH</span></button>
          <button id="radar-button" class="icon-button" aria-label="Cycle radar zoom range (M)"><span class="radar-button-label">RADAR: 160M</span><span class="radar-button-label-compact">MAP</span></button>
          <button id="graphics-button" class="icon-button" aria-label="Open graphics settings"><span class="graphics-button-label">GRAPHICS</span><span class="graphics-button-label-compact">GFX</span></button>
          <button id="sound-button" class="icon-button" aria-label="Open sound settings"><span class="sound-button-label">SOUND</span><span class="sound-button-label-compact">VOL</span></button>
          <button id="fullscreen-button" class="icon-button" aria-label="Enter full screen" aria-pressed="false">FULL SCREEN</button>
          <button id="mute-button" class="icon-button" aria-label="Toggle sound">SOUND ON</button>
          <button id="main-menu-button" class="icon-button" aria-label="Return to main menu">MAIN MENU</button>
          <button id="pause-button" class="icon-button" aria-label="Pause game">PAUSE</button>
        </div>
      </header>

      <section id="hud" class="hud is-hidden" aria-live="polite">
        <div class="speed-panel">
          <div class="speed-number"><span id="speed">000</span><small>KM/H</small></div>
          <div class="speed-track"><span id="speed-fill"></span></div>
        </div>
        <div class="gear-panel" aria-label="Sequential transmission control">
          <div class="gear-badge"><small>GEAR</small><strong id="gear-indicator">3</strong></div>
          <div class="gear-controls">
            <button id="gear-down-btn" class="gear-btn" type="button" aria-label="Shift gear down" title="Shift Down (Left Paddle / Q)">−</button>
            <span id="gear-name">3RD</span>
            <button id="gear-up-btn" class="gear-btn" type="button" aria-label="Shift gear up" title="Shift Up (Right Paddle / E / Shift)">+</button>
          </div>
        </div>
        <div class="run-stats">
          <div><span>DISTANCE</span><strong id="distance">0.00 <small>KM</small></strong></div>
          <div><span>OVERTAKES</span><strong id="overtakes">0</strong></div>
          <div><span>SCORE</span><strong id="score">000000</strong></div>
          <div><span>HEALTH</span><strong id="health">100%</strong></div>
        </div>
        <div id="road-condition-badge" class="road-condition-badge is-optimal" aria-label="Road surface condition">
          <span id="road-condition-icon">☀️</span>
          <span id="road-condition-text">ROAD: DRY · 100% GRIP</span>
        </div>
        <div id="assist" class="assist"><i></i><span>READY</span></div>
        <div class="steer-meter">
          <span>L</span><div class="steer-track"><i id="steer-indicator"></i></div><span>R</span>
        </div>
      </section>

      <aside id="performance-hud" class="performance-hud is-hidden" aria-label="Performance diagnostics">
        <div class="performance-hud-title"><span>PERFORMANCE</span><small>F3</small></div>
        <div class="performance-hud-grid">
          <span>FPS<strong id="perf-fps">--</strong></span>
          <span>FRAME<strong id="perf-frame">--</strong></span>
          <span>P90<strong id="perf-p90">--</strong></span>
          <span>CALLS<strong id="perf-calls">--</strong></span>
          <span>TRIS<strong id="perf-triangles">--</strong></span>
          <span>GEOMETRY<strong id="perf-geometries">--</strong></span>
          <span>TEXTURES<strong id="perf-textures">--</strong></span>
          <span>QUALITY<strong id="perf-quality">--</strong></span>
        </div>
      </aside>

      <aside id="radar-hud" class="radar-hud is-hidden" aria-label="Tactical Road Radar">
        <div class="radar-header">
          <div class="radar-title">
            <span class="radar-status-dot"></span>
            <span>TACTICAL RADAR</span>
          </div>
          <button id="radar-zoom-btn" class="radar-zoom-btn" type="button" aria-label="Cycle radar zoom range (M)" title="Toggle Zoom Range (M)">160M</button>
        </div>
        <div class="radar-display">
          <canvas id="radar-canvas" width="220" height="220" title="Click to cycle zoom range (100M / 160M / 240M)"></canvas>
          <div id="radar-turn-warning" class="radar-turn-warning is-hidden">
            <span id="radar-turn-arrow" class="turn-arrow">▶▶</span>
            <span id="radar-turn-text" class="turn-text">TURN AHEAD</span>
          </div>
        </div>
        <div class="radar-legend">
          <span class="legend-item legend-traffic"><i></i>TRAFFIC</span>
          <span class="legend-item legend-hazard"><i></i>HAZARD</span>
          <span class="legend-item legend-bonus"><i></i>BONUS</span>
        </div>
      </aside>

      <aside class="camera-shell is-offline is-hidden" aria-label="Camera tracking preview">
        <video id="camera-video" playsinline muted></video>
        <canvas id="camera-canvas"></canvas>
        <div class="camera-topline"><span><i></i> HAND CAM</span><button id="hide-camera">HIDE</button></div>
        <div id="camera-hint" class="camera-hint">WAITING FOR CAMERA</div>
      </aside>
      <button id="show-camera" class="show-camera is-hidden">SHOW HAND CAM</button>

      <section id="graphics-settings" class="graphics-settings is-hidden" role="dialog" aria-modal="true" aria-labelledby="graphics-title">
        <button id="graphics-backdrop" class="graphics-backdrop" type="button" aria-label="Close graphics settings"></button>
        <div class="graphics-settings-card">
          <div class="graphics-settings-heading">
            <div><small>DISPLAY</small><h2 id="graphics-title">GRAPHICS</h2></div>
            <button id="graphics-close" type="button" aria-label="Close graphics settings">CLOSE</button>
          </div>
          <label class="graphics-setting-row" for="graphics-quality">
            <span><strong>QUALITY PRESET</strong><small>Resolution and shadow quality</small></span>
            <select id="graphics-quality">
              <option value="auto">AUTO</option>
              <option value="low">LOW</option>
              <option value="medium">MEDIUM</option>
              <option value="high">HIGH</option>
            </select>
          </label>
          <p id="graphics-quality-description" class="graphics-quality-description"></p>
          <p class="graphics-settings-note"><i></i> Changes apply immediately and are saved for future runs.</p>
        </div>
      </section>

      <section id="sound-settings" class="sound-settings is-hidden" role="dialog" aria-modal="true" aria-labelledby="sound-title">
        <button id="sound-backdrop" class="sound-backdrop" type="button" aria-label="Close sound settings"></button>
        <div class="sound-settings-card">
          <div class="sound-settings-heading">
            <div><small>AUDIO</small><h2 id="sound-title">SOUND SETTINGS</h2></div>
            <button id="sound-close" type="button" aria-label="Close sound settings">CLOSE</button>
          </div>

          <div class="sound-setting-group">
            <div class="sound-setting-label">
              <span><strong>MASTER VOLUME</strong><small>Overall game volume (up to 200% boost)</small></span>
              <strong id="sound-master-value" class="sound-value-badge">100%</strong>
            </div>
            <input id="sound-master-volume" class="sound-slider" type="range" min="0" max="200" step="1" value="100" aria-label="Master volume">
            <div class="sound-presets">
              <button type="button" class="sound-preset-btn" data-preset="0">MUTE</button>
              <button type="button" class="sound-preset-btn" data-preset="50">50%</button>
              <button type="button" class="sound-preset-btn" data-preset="100">100%</button>
              <button type="button" class="sound-preset-btn" data-preset="150">150% BOOST</button>
              <button type="button" class="sound-preset-btn sound-preset-boost" data-preset="200">200% MAX</button>
            </div>
          </div>

          <div class="sound-setting-group">
            <div class="sound-setting-label">
              <span><strong>ENGINE SOUND</strong><small>Vehicle RPM and exhaust roar</small></span>
              <strong id="sound-engine-value" class="sound-value-badge">100%</strong>
            </div>
            <input id="sound-engine-volume" class="sound-slider" type="range" min="0" max="200" step="1" value="100" aria-label="Engine volume">
          </div>

          <div class="sound-setting-group">
            <div class="sound-setting-label">
              <span><strong>SYNTH BEAT / MUSIC</strong><small>Rhythm, bassline and synth notes</small></span>
              <strong id="sound-music-value" class="sound-value-badge">100%</strong>
            </div>
            <input id="sound-music-volume" class="sound-slider" type="range" min="0" max="200" step="1" value="100" aria-label="Music volume">
          </div>

          <div class="sound-settings-actions">
            <button id="sound-test-button" class="secondary-button" type="button"><i>♪</i> TEST SOUND</button>
            <button id="sound-mute-toggle" class="secondary-button" type="button">MUTE AUDIO</button>
          </div>

          <p class="sound-settings-note"><i></i> Audio settings are saved automatically. Boost up to 200% available.</p>
        </div>
      </section>

      <section id="overlay" class="overlay">
        <div class="modal intro-modal">
          <div class="eyebrow"><span></span> TWO-HAND DRIVING EXPERIENCE</div>
          <h1>YOUR HANDS.<br><em>YOUR ROAD.</em></h1>
          <p class="lead">Grip an invisible wheel. Raise both thumbs to slow down, or show both palms to stop.</p>
          <div class="wheel-guide" aria-hidden="true">
            <div class="hand hand-left"><span></span><b>LEFT HAND<br><small>PADDLE (−)</small></b></div>
            <div class="virtual-wheel"><span class="wheel-center"></span></div>
            <div class="hand hand-right"><span></span><b>RIGHT HAND<br><small>PADDLE (+)</small></b></div>
          </div>
          <div class="instruction-row">
            <div><b>01</b><span>Allow camera<br>access</span></div>
            <div><b>02</b><span>Closed hands<br>steer wheel</span></div>
            <div><b>03</b><span>Raise right index:<br>gear up & boost speed</span></div>
            <div><b>04</b><span>Thumbs: half brake<br>palms: full stop</span></div>
          </div>
          <div id="car-options" class="car-options">
            <label><span>YOUR CAR</span><select id="driver-car" aria-label="Choose your car model">${carOptions}</select></label>
            <label><span>CAMERA VIEW</span><select id="camera-select" aria-label="Choose starting camera view">
              <option value="0" selected>FRONT ROAD (FIRST PERSON)</option>
              <option value="1">CHASE (THIRD PERSON)</option>
              <option value="2">FAR CHASE (AERIAL)</option>
              <option value="3">HOOD (BONNET MOUNT)</option>
              <option value="4">BUMPER (LOW ROAD)</option>
            </select></label>
            <label><span>PAINT COLOR</span><input type="color" id="driver-color" aria-label="Choose your car color" value="#f5f7f4"></label>
            <label><span>TRAFFIC CARS</span><select id="traffic-count" aria-label="Choose number of traffic cars">${trafficOptions}</select></label>
            <label><span>CAR VARIETY</span><select id="car-model-count" aria-label="Choose number of different car models">${varietyOptions}</select></label>
          </div>
          <div class="menu-soundtrack-banner">
            <button id="menu-soundtrack-btn" class="menu-soundtrack-btn" type="button" aria-label="Toggle realistic menu soundtrack">
              <span class="music-pulse-icon"><i>♪</i></span>
              <span class="soundtrack-info">
                <strong>REALISTIC RACING SOUNDTRACK</strong>
                <small id="soundtrack-subtitle">ATMOSPHERIC MENU THEME &bull; ENGINE PREVIEWS ACTIVE</small>
              </span>
              <span id="soundtrack-badge" class="soundtrack-badge">PLAYING</span>
            </button>
          </div>
          <p class="traffic-performance-note"><i>!</i> More traffic cars or model variety may reduce frame rates on lower-powered devices.</p>
          <div class="modal-actions">
            <button id="camera-start" class="primary-button"><span>START WITH HANDS</span><i>→</i></button>
            <button id="keyboard-start" class="secondary-button">USE KEYBOARD INSTEAD <small>WASD / ARROWS</small></button>
          </div>
          <p class="privacy"><i>●</i> Camera processing stays on this device. No video is saved or uploaded.</p>
        </div>
      </section>

      <section id="asset-gate" class="asset-gate" role="dialog" aria-modal="true" aria-labelledby="asset-gate-title">
        <img class="asset-gate-poster" src="${loadingPosterPath}" alt="" aria-hidden="true" decoding="async" fetchpriority="high">
        <div class="modal asset-gate-modal">
          <div class="asset-gate-copy">
            <div class="eyebrow"><span></span> GAME STARTUP</div>
            <h2 id="asset-gate-title">GETTING ROAD READY</h2>
            <p id="asset-gate-message">Saving core game assets now for faster future starts.</p>
          </div>
          <div class="asset-gate-progress">
            <div id="asset-loader" class="asset-loader" aria-hidden="true"><span id="asset-download-percent">0%</span></div>
            <div id="asset-download" class="asset-download" data-state="checking" role="status" aria-live="polite">
              <div class="asset-download-head"><span id="asset-download-label">CHECKING ASSETS</span></div>
              <div class="asset-download-track"><i id="asset-download-fill"></i></div>
              <small id="asset-download-detail">Checking browser storage...</small>
            </div>
            <button id="asset-download-retry" class="secondary-button is-hidden" type="button">RETRY DOWNLOAD</button>
          </div>
        </div>
      </section>

      <div class="corner corner-tl"></div><div class="corner corner-tr"></div>
      <div class="corner corner-bl"></div><div class="corner corner-br"></div>
    </main>
  `;
}
