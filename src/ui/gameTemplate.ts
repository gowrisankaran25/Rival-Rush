import {
  DEFAULT_CAR_MODEL_ID,
  VEHICLE_SPECS,
} from '../game/vehicleCatalog';
import { RACE_MODE_LIST } from '../game/progression/raceModes';
import { ACHIEVEMENTS_LIST, MOTORSPORT_PRESET_PAINTS } from '../services/progressionStore';

/**
 * Builds the complete AAA racing launcher and in-game application shell.
 */
export function createGameTemplate(): string {
  const loadingPosterPath = `${import.meta.env.BASE_URL}images/driftline-poster-loading.webp`;

  const paintSwatchesHtml = MOTORSPORT_PRESET_PAINTS.map(
    (paint, idx) =>
      `<button type="button" class="paint-swatch${idx === 0 ? ' is-active' : ''}" data-color="${paint.hex}" style="background-color: ${paint.hex}" title="${paint.name}" aria-label="${paint.name}"></button>`,
  ).join('');

  const raceModeCardsHtml = RACE_MODE_LIST.map(
    (mode) => `
      <div class="mode-card" data-mode="${mode.id}">
        <div class="mode-card-header">
          <span class="mode-category">${mode.category}</span>
          <span class="mode-reward">+${mode.baseRewardCredits} CR</span>
        </div>
        <h3 class="mode-title">${mode.name}</h3>
        <p class="mode-tagline">${mode.tagline}</p>
        <p class="mode-desc">${mode.description}</p>
        <div class="mode-specs">
          <div><small>DISTANCE</small><strong>${mode.distanceMeters ? `${mode.distanceMeters} M` : 'ENDLESS'}</strong></div>
          <div><small>TIME LIMIT</small><strong>${mode.timeLimitSeconds ? `${mode.timeLimitSeconds}S` : 'NONE'}</strong></div>
          <div><small>TARGET</small><strong>${mode.hasRival ? 'RIVAL AI' : mode.targetOvertakes ? `${mode.targetOvertakes} CARS` : 'SURVIVAL'}</strong></div>
        </div>
        <div class="mode-medals">
          <span>🥇 ${mode.medalCriteria.gold}</span>
          <span>🥈 ${mode.medalCriteria.silver}</span>
        </div>
        <button class="primary-button mode-select-btn" type="button" data-mode="${mode.id}">
          <span>SELECT & RACE</span><i>→</i>
        </button>
      </div>
    `,
  ).join('');

  const achievementsHtml = ACHIEVEMENTS_LIST.map(
    (ach) => `
      <div class="achievement-card" data-ach-id="${ach.id}">
        <div class="achievement-icon">${ach.icon}</div>
        <div class="achievement-info">
          <div class="achievement-header">
            <strong>${ach.title}</strong>
            <span class="achievement-reward">+${ach.rewardCredits} CR</span>
          </div>
          <p>${ach.description}</p>
          <span class="achievement-status is-locked">LOCKED</span>
        </div>
      </div>
    `,
  ).join('');

  return `
    <main class="game-shell">
      <div id="viewport" class="viewport" aria-label="3D driving game"></div>

      <!-- AAA Top Navigation Bar -->
      <header class="topbar">
        <a class="brand" href="#" id="nav-brand" aria-label="Rival Rush home">
          <span class="brand-mark"></span>
          <span class="brand-text">RIVAL RUSH</span>
        </a>

        <nav class="topbar-nav" aria-label="Main Navigation">
          <button id="nav-home" class="nav-tab is-active" type="button">HOME</button>
          <button id="nav-play" class="nav-tab" type="button">PLAY</button>
          <button id="nav-garage" class="nav-tab" type="button">GARAGE</button>
          <button id="nav-achievements" class="nav-tab" type="button">ACHIEVEMENTS</button>
          <button id="nav-settings" class="nav-tab" type="button">SETTINGS</button>
        </nav>

        <div class="topbar-actions">
          <button type="button" id="tracking-pill" class="tracking-pill" data-state="off" title="Toggle Hand Tracking / Keyboard controls">
            <span class="status-dot"></span><span id="tracking-label">INPUT: HAND TRACKING</span>
          </button>
          <div class="player-credits-badge" id="topbar-credits" title="Career Credits">
            <i>⚡</i><span id="topbar-credits-val">1,500</span> <small>CR</small>
          </div>
          <button id="camera-button" class="icon-button ingame-only" aria-label="Change camera view angle (C)"><span class="camera-button-label">CAM: FRONT ROAD</span><span class="camera-button-label-compact">CAM</span></button>
          <button id="weather-button" class="icon-button ingame-only" aria-label="Change weather condition"><span class="weather-button-label">WEATHER: AUTO</span><span class="weather-button-label-compact">WTH</span></button>
          <button id="headlight-button" class="icon-button ingame-only" aria-label="Cycle headlights (H / L)"><span class="headlight-button-label">LIGHTS: AUTO</span><span class="headlight-button-label-compact">LGT</span></button>
          <button id="radar-button" class="icon-button ingame-only" aria-label="Cycle radar zoom range (M)"><span class="radar-button-label">RADAR: 160M</span><span class="radar-button-label-compact">RDR</span></button>
          <button id="graphics-button" class="icon-button" aria-label="Open graphics settings"><span class="graphics-button-label">GRAPHICS</span><span class="graphics-button-label-compact">GFX</span></button>
          <button id="sound-button" class="icon-button" aria-label="Open sound settings"><span class="sound-button-label">SOUND</span><span class="sound-button-label-compact">VOL</span></button>
          <button id="fullscreen-button" class="icon-button" aria-label="Enter full screen" aria-pressed="false">FULL SCREEN</button>
          <button id="mute-button" class="icon-button" aria-label="Toggle sound">SOUND ON</button>
          <button id="main-menu-button" class="icon-button is-hidden" aria-label="Return to launcher">MENU</button>
          <button id="pause-button" class="icon-button is-hidden" aria-label="Pause game">PAUSE</button>
        </div>
      </header>

      <!-- SCREEN 1: Cinematic Launcher Hero Screen -->
      <section id="view-home" class="launcher-view active-view" aria-label="Home Screen">
        <div class="hero-container">
          <div class="hero-content">
            <div class="hero-eyebrow">
              <span class="pulse-indicator"></span>
              <span>NEXT-GEN RACING SIMULATOR</span>
            </div>
            <h1 class="hero-title">RIVAL RUSH</h1>
            <p class="hero-tagline">OWN THE ROAD.<br><em>MASTER THE WHEEL.</em></p>
            <p class="hero-lead">
              Experience the thrill of high-speed racing with intuitive webcam hand gestures or precision keyboard controls.
            </p>

            <div class="hero-actions">
              <button id="btn-hero-start" class="primary-button hero-cta" type="button">
                <span>START RACE</span><i>→</i>
              </button>
              <button id="btn-hero-garage" class="secondary-button hero-cta" type="button">
                <span>CUSTOMIZE VEHICLE</span>
              </button>
            </div>

            <div class="hero-status-strip">
              <div class="status-card">
                <small>CURRENT VEHICLE</small>
                <strong id="hero-car-name">${VEHICLE_SPECS[DEFAULT_CAR_MODEL_ID].label}</strong>
              </div>
              <div class="status-card">
                <small>ACTIVE MODE</small>
                <strong id="hero-mode-name">ENDLESS HIGHWAY</strong>
              </div>
              <div class="status-card is-interactive" id="hero-control-card" role="button" tabindex="0" title="Click to toggle Hand Tracking / Keyboard controls">
                <small>CONTROL MODE (CLICK TO TOGGLE)</small>
                <strong id="hero-control-mode">HAND GESTURES / KEYS</strong>
              </div>
              <div class="status-card">
                <small>CAREER CREDITS</small>
                <strong id="hero-credits-val">1,500 CR</strong>
              </div>
            </div>

            <div class="menu-soundtrack-banner">
              <button id="menu-soundtrack-btn" class="menu-soundtrack-btn" type="button" aria-label="Toggle realistic menu soundtrack">
                <span class="music-pulse-icon"><i>♪</i></span>
                <span class="soundtrack-info">
                  <strong>ATMOSPHERIC MOTORSPORT SOUNDTRACK</strong>
                  <small id="soundtrack-subtitle">AUTHENTIC ENGINE PREVIEWS & AMBIENT CHORDS ACTIVE</small>
                </span>
                <span id="soundtrack-badge" class="soundtrack-badge">PLAYING</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- SCREEN 2: Vehicle Garage & Customization -->
      <section id="view-garage" class="launcher-view is-hidden" aria-label="Vehicle Garage">
        <div class="garage-container">
          <div class="garage-header">
            <div>
              <span class="section-eyebrow">GARAGE & SHOWROOM</span>
              <h2>CUSTOMIZE VEHICLE</h2>
            </div>
            <button id="btn-garage-back" class="secondary-button" type="button">BACK TO MENU</button>
          </div>

          <div class="garage-layout">
            <div class="garage-controls-panel">
              <div class="car-carousel-nav">
                <button id="garage-prev-car" class="carousel-arrow" type="button" aria-label="Previous car">◀</button>
                <div class="carousel-counter">
                  <span id="garage-car-index">1</span> / <span id="garage-car-total">8</span>
                </div>
                <button id="garage-next-car" class="carousel-arrow" type="button" aria-label="Next car">▶</button>
              </div>

              <div class="vehicle-info-card">
                <span id="garage-car-category" class="car-category-badge">PERFORMANCE TRUCK</span>
                <h3 id="garage-car-name">2017 Ford F-150 Raptor</h3>
                <p id="garage-car-desc">High-output twin-turbo V6 terrain conqueror. Maximum stability, forgiving road manners, and heavy presence.</p>

                <div class="vehicle-specs-grid">
                  <div class="spec-bar-row">
                    <span>TOP SPEED <small id="garage-stat-speed-val">195 KM/H</small></span>
                    <div class="spec-track"><i id="garage-stat-speed" style="width: 70%"></i></div>
                  </div>
                  <div class="spec-bar-row">
                    <span>ACCELERATION <small id="garage-stat-accel-val">6.8 / 10</small></span>
                    <div class="spec-track"><i id="garage-stat-accel" style="width: 68%"></i></div>
                  </div>
                  <div class="spec-bar-row">
                    <span>HANDLING <small id="garage-stat-handling-val">7.2 / 10</small></span>
                    <div class="spec-track"><i id="garage-stat-handling" style="width: 72%"></i></div>
                  </div>
                  <div class="spec-bar-row">
                    <span>NITRO / BOOST <small id="garage-stat-nitro-val">6.5 / 10</small></span>
                    <div class="spec-track"><i id="garage-stat-nitro" style="width: 65%"></i></div>
                  </div>
                </div>

                <div class="paint-customizer-section">
                  <label class="paint-section-label">MOTORSPORT PAINTWORK</label>
                  <div class="paint-swatches-grid">
                    ${paintSwatchesHtml}
                  </div>
                  <div class="custom-color-row">
                    <span>CUSTOM COLOR:</span>
                    <input type="color" id="garage-color-picker" value="#f5f7f4" title="Choose custom paint color">
                  </div>
                </div>

                <div class="garage-action-row">
                  <button id="garage-select-btn" class="primary-button" type="button">
                    <span>SELECT CAR</span>
                  </button>
                  <button id="garage-test-engine-btn" class="secondary-button" type="button" title="Rev Engine">
                    <i>🔊</i> REV ENGINE
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- SCREEN 3: Race Mode Selection -->
      <section id="view-modes" class="launcher-view is-hidden" aria-label="Race Mode Selection">
        <div class="modes-container">
          <div class="modes-header">
            <div>
              <span class="section-eyebrow">RACING DISCIPLINES</span>
              <h2>CHOOSE YOUR RACE MODE</h2>
            </div>
            <button id="btn-modes-back" class="secondary-button" type="button">BACK TO MENU</button>
          </div>

          <div class="modes-grid">
            ${raceModeCardsHtml}
          </div>
        </div>
      </section>

      <!-- SCREEN 4: Hand Tracking Calibration Screen -->
      <section id="view-calibrate" class="launcher-view is-hidden" aria-label="Hand Tracking Calibration">
        <div class="calibrate-container">
          <div class="calibrate-card">
            <div class="eyebrow"><span></span> WEBCAM HAND TRACKING CALIBRATION</div>
            <h2>HOLD THE INVISIBLE WHEEL</h2>
            <p class="calibrate-lead">Hold two closed hands level in front of your camera. Maintain neutral steering while calibration completes.</p>

            <div class="calibrate-status-badge" id="calib-status-badge">
              <span class="status-dot"></span>
              <span id="calib-status-msg">CONNECTING TO CAMERA...</span>
            </div>

            <!-- Live Camera Feed and Hand Tracking Mount -->
            <div class="calibrate-camera-box" id="calib-camera-slot"></div>

            <div class="wheel-guide" aria-hidden="true">
              <div class="hand hand-left"><span></span><b>LEFT HAND<br><small>STEER & DOWNSHIFT</small></b></div>
              <div class="virtual-wheel"><span class="wheel-center"></span></div>
              <div class="hand hand-right"><span></span><b>RIGHT HAND<br><small>STEER & UPSHIFT</small></b></div>
            </div>

            <div class="calibration-ring-wrapper">
              <div class="calibration-ring"><span id="calibration-percent">0%</span></div>
            </div>

            <div class="calibrate-instructions">
              <div class="inst-item"><b>01</b><span>Allow camera access in your browser</span></div>
              <div class="inst-item"><b>02</b><span>Turn two fists like a steering wheel</span></div>
              <div class="inst-item"><b>03</b><span>Raise right index finger to boost speed</span></div>
              <div class="inst-item"><b>04</b><span>Raise thumbs to brake, open palms to stop</span></div>
            </div>

            <div class="calibrate-actions">
              <button id="calib-start-btn" class="primary-button" type="button" disabled>
                <span>START DRIVING</span><i>→</i>
              </button>
              <button id="calib-keyboard-btn" class="secondary-button" type="button">
                <span>SWITCH TO KEYBOARD CONTROLS</span>
              </button>
            </div>

            <p class="privacy-note"><i>🔒</i> Webcam processing is strictly local to your browser. No video is ever saved or uploaded.</p>
          </div>
        </div>
      </section>

      <!-- SCREEN 5: Achievements & Career Records -->
      <section id="view-achievements" class="launcher-view is-hidden" aria-label="Achievements Screen">
        <div class="achievements-container">
          <div class="achievements-header">
            <div>
              <span class="section-eyebrow">HALL OF FAME</span>
              <h2>CAREER & ACHIEVEMENTS</h2>
            </div>
            <button id="btn-achievements-back" class="secondary-button" type="button">BACK TO MENU</button>
          </div>

          <div class="career-stats-banner">
            <div class="career-stat-card">
              <small>TOTAL RACES</small>
              <strong id="stat-total-races">0</strong>
            </div>
            <div class="career-stat-card">
              <small>RACE VICTORIES</small>
              <strong id="stat-total-wins">0</strong>
            </div>
            <div class="career-stat-card">
              <small>DISTANCE TRAVELLED</small>
              <strong id="stat-total-distance">0.0 KM</strong>
            </div>
            <div class="career-stat-card">
              <small>CLEAN OVERTAKES</small>
              <strong id="stat-total-overtakes">0</strong>
            </div>
            <div class="career-stat-card">
              <small>MAX TOP SPEED</small>
              <strong id="stat-max-speed">0 KM/H</strong>
            </div>
          </div>

          <div class="achievements-grid">
            ${achievementsHtml}
          </div>
        </div>
      </section>

      <!-- SCREEN 6: AAA Cinematic Results & Victory Screen -->
      <section id="view-results" class="launcher-view is-hidden" aria-label="Race Results">
        <div class="results-container">
          <div class="results-card">
            <div class="results-banner-wrapper">
              <span class="results-trophy" id="results-trophy">🏆</span>
              <h2 id="results-headline">VICTORY!</h2>
              <div class="results-position-badge" id="results-position-badge">1ST PLACE</div>
              <p id="results-subtitle">Flawless execution on the asphalt. Personal records shattered.</p>
            </div>

            <div class="results-stats-grid">
              <div class="r-stat-box">
                <small>FINAL SCORE</small>
                <strong id="results-score">000000</strong>
              </div>
              <div class="r-stat-box">
                <small>RACE TIME</small>
                <strong id="results-time">00:00.00</strong>
              </div>
              <div class="r-stat-box">
                <small>DISTANCE COVERED</small>
                <strong id="results-distance">0.00 KM</strong>
              </div>
              <div class="r-stat-box">
                <small>MAX SPEED</small>
                <strong id="results-max-speed">0 KM/H</strong>
              </div>
              <div class="r-stat-box">
                <small>CLEAN OVERTAKES</small>
                <strong id="results-overtakes">0</strong>
              </div>
              <div class="r-stat-box">
                <small>VEHICLE HEALTH</small>
                <strong id="results-health">100%</strong>
              </div>
            </div>

            <div class="results-rewards-card">
              <div class="rewards-head">
                <span>REWARDS EARNED</span>
                <strong id="results-credits-earned">+1,200 CR</strong>
              </div>
              <div id="results-pb-callout" class="pb-callout is-hidden">
                <i>⭐</i> NEW PERSONAL BEST RECORD!
              </div>
            </div>

            <div class="results-actions">
              <button id="btn-results-again" class="primary-button" type="button">
                <span>RACE AGAIN</span><i>↻</i>
              </button>
              <button id="btn-results-next" class="secondary-button" type="button">
                <span>NEXT RACE</span><i>→</i>
              </button>
              <button id="btn-results-garage" class="secondary-button" type="button">
                <span>GARAGE</span>
              </button>
              <button id="btn-results-menu" class="secondary-button" type="button">
                <span>MAIN MENU</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- IN-GAME HUD -->
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

        <div class="race-timer-panel">
          <small>RACE TIMER</small>
          <strong id="race-timer">00:00.00</strong>
        </div>

        <div id="remaining-panel" class="remaining-panel is-hidden">
          <small>DISTANCE TO FINISH</small>
          <strong id="remaining-value">2,500 M</strong>
        </div>

        <div id="position-badge" class="position-badge is-hidden">
          <small>POSITION</small>
          <strong id="position-value">1ST</strong>
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

      <!-- COUNTDOWN OVERLAY (3, 2, 1, GO!) -->
      <div id="countdown-overlay" class="countdown-overlay is-hidden" aria-live="assertive">
        <div id="countdown-text" class="countdown-number">3</div>
      </div>

      <!-- APPROACH WARNING BANNER -->
      <div id="approach-alert" class="approach-alert is-hidden" aria-live="assertive">
        <span class="approach-icon">🏁</span>
        <span id="approach-text" class="approach-text">500M TO FINISH</span>
      </div>

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

      <!-- GRAPHICS SETTINGS MODAL -->
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

      <!-- SOUND SETTINGS MODAL -->
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

      <!-- GENERAL SETTINGS MODAL -->
      <section id="general-settings" class="graphics-settings is-hidden" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button id="settings-backdrop" class="graphics-backdrop" type="button" aria-label="Close settings"></button>
        <div class="graphics-settings-card">
          <div class="graphics-settings-heading">
            <div><small>PREFERENCES</small><h2 id="settings-title">GAME SETTINGS</h2></div>
            <button id="settings-close" type="button" aria-label="Close settings">CLOSE</button>
          </div>
          <div class="settings-rows">
            <label class="graphics-setting-row" for="settings-control-mode">
              <span><strong>DEFAULT CONTROL MODE</strong><small>Input system at race start</small></span>
              <select id="settings-control-mode">
                <option value="keyboard">KEYBOARD (WASD / ARROWS)</option>
                <option value="hands">WEBCAM HAND TRACKING</option>
              </select>
            </label>
            <label class="graphics-setting-row" for="settings-camera-view">
              <span><strong>DEFAULT CAMERA VIEW</strong><small>Starting driving viewpoint</small></span>
              <select id="settings-camera-view">
                <option value="0">FRONT ROAD (FIRST PERSON)</option>
                <option value="1">CHASE (THIRD PERSON)</option>
                <option value="2">FAR CHASE (AERIAL)</option>
                <option value="3">HOOD (BONNET MOUNT)</option>
                <option value="4">BUMPER (LOW ROAD)</option>
              </select>
            </label>
            <div class="danger-zone-card">
              <div>
                <strong>RESET CAREER PROGRESS</strong>
                <small>Clear saved credits, unlocked vehicles, medals, and high scores</small>
              </div>
              <button id="btn-reset-career" class="secondary-button danger-button" type="button">RESET ALL DATA</button>
            </div>
          </div>
        </div>
      </section>

      <!-- FALLBACK OVERLAY FOR MODAL NOTICES & PAUSE -->
      <section id="overlay" class="overlay is-hidden"></section>

      <!-- ASSET DOWNLOAD GATE -->
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
