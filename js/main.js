import { audio } from './audio.js?v=4';
import { InputController, triggerScreenShake, flushScreenShake } from './engine.js?v=4';
import { network } from './network.js?v=4';
import GameShowdown from './gameShowdown.js?v=4';
import GameBumpers from './gameBumpers.js?v=4';
import GameArtillery from './gameArtillery.js?v=4';
import GameBlackjack from './gameBlackjack.js?v=4';
import GameLuminousRace from './gameLuminousRace.js?v=4';
import GameNeonTether from './gameNeonTether.js?v=4';
import GameNeonVortex from './gameNeonVortex.js?v=4';
import GamePrismCapture from './gamePrismCapture.js?v=4';
import GameCyberSlice from './gameCyberSlice.js?v=4';
import GameNeonChaosBall from './gameNeonChaosBall.js?v=4';
import GameSymmetryClash from './gameSymmetryClash.js?v=4';

class ArcadeSystem {
  constructor() {
    this.input = new InputController();
    this.activeGame = null;
    this.activeGameKey = null;
    this.isNetworkClient = false;
    this.lastSentKeysStr = '';
    
    // Player Count Mode (2 or 3)
    this.playerMode = 2;
    this.mySlot = null; // Assigned on Client: 'p2' or 'p3'

    // Bidirectional Sequence counters to prevent out-of-order jitter and stuck inputs
    this.hostStateSeq = 0;
    this.clientInputSeq = 0;
    this.lastReceivedStateSeq = 0;
    this.lastReceivedInputSeqP2 = 0;
    this.lastReceivedInputSeqP3 = 0;
    
    // Persistent Scores
    this.stats = {
      showdown: { p1: 0, p2: 0, p3: 0, p4: 0 },
      bumpers: { p1: 0, p2: 0, p3: 0, p4: 0 },
      artillery: { p1: 0, p2: 0, p3: 0, p4: 0 },
      blackjack: { p1: 0, p2: 0, p3: 0, p4: 0 },
      luminousrace: { p1: 0, p2: 0, p3: 0, p4: 0 },
      neontether: { p1: 0, p2: 0, p3: 0, p4: 0 },
      neonvortex: { p1: 0, p2: 0, p3: 0, p4: 0 },
      prismcapture: { p1: 0, p2: 0, p3: 0, p4: 0 },
      cyberslice: { p1: 0, p2: 0, p3: 0, p4: 0 },
      neonchaosball: { p1: 0, p2: 0, p3: 0, p4: 0 },
      symmetryclash: { p1: 0, p2: 0, p3: 0, p4: 0 }
    };

    this.loopId = null;

    this.initDOMElements();
    this.loadStats();
    this.bindEvents();
    
    // Begin main animation loop (polls gamepads & P2/P3 net inputs)
    this.startGameLoop();
  }

  initDOMElements() {
    // Screen Elements
    this.selectorScreen = document.getElementById('game-selector-screen');
    this.arenaScreen = document.getElementById('game-arena-screen');
    this.logoButton = document.getElementById('logo-button');

    // Cards
    this.cardShowdown = document.getElementById('card-showdown');
    this.cardBumpers = document.getElementById('card-bumpers');
    this.cardArtillery = document.getElementById('card-artillery');
    this.cardBlackjack = document.getElementById('card-blackjack');
    this.cardLuminousRace = document.getElementById('card-luminousrace');
    this.cardNeonTether = document.getElementById('card-neontether');
    this.cardNeonVortex = document.getElementById('card-neonvortex');
    this.cardPrismCapture = document.getElementById('card-prismcapture');
    this.cardCyberSlice = document.getElementById('card-cyberslice');
    this.cardNeonChaosBall = document.getElementById('card-neonchaosball');
    this.cardSymmetryClash = document.getElementById('card-symmetryclash');

    // Player Mode Buttons
    this.btnMode2p = document.getElementById('btn-mode-2p');
    this.btnMode3p = document.getElementById('btn-mode-3p');
    this.btnMode4p = document.getElementById('btn-mode-4p');

    // Scorecard P3 UI Elements
    this.player3StatBlock = document.getElementById('player-3-stat');
    this.vsDivider2 = document.getElementById('score-divider-vs-2');
    this.player3Manual = document.getElementById('player-3-manual');

    // Scorecard P4 UI Elements
    this.player4StatBlock = document.getElementById('player-4-stat');
    this.vsDivider3 = document.getElementById('score-divider-vs-3');

    // Controls
    this.btnHelp = document.getElementById('toggle-help');
    this.btnAudio = document.getElementById('toggle-audio');
    this.audioIcon = document.getElementById('audio-icon');
    this.sliderVolume = document.getElementById('volume-slider');
    this.btnResetStats = document.getElementById('reset-stats');

    // Game Control Buttons
    this.btnExitGame = document.getElementById('exit-game');
    this.btnRestartGame = document.getElementById('restart-game');
    this.activeGameTitle = document.getElementById('active-game-title');
    this.controlsSummaryText = document.getElementById('controls-summary-text');

    // Canvas & Overlays
    this.canvas = document.getElementById('game-canvas');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.victoryOverlay = document.getElementById('victory-overlay');
    this.victoryBanner = document.getElementById('victory-banner');
    this.victoryDetails = document.getElementById('victory-details');
    
    // Overlay actions
    this.btnResume = document.getElementById('resume-btn');
    this.btnRestartOverlay = document.getElementById('restart-btn');
    this.btnNextRound = document.getElementById('next-round-btn');
    this.btnMenuReturn = document.getElementById('menu-return-btn');

    // Modal
    this.helpModal = document.getElementById('help-modal');
    this.btnCloseModalX = document.getElementById('close-modal');
    this.btnCloseModalBtn = document.getElementById('close-modal-btn');

    // Status Panel / How to Play
    this.btnHowToPlaySide = document.getElementById('btn-how-to-play-side');

    // Netplay Lobby Elements
    this.btnNetHost = document.getElementById('btn-net-host');
    this.roomCodeDisplay = document.getElementById('net-room-code-display');
    this.roomCodeVal = document.getElementById('net-room-code');
    this.btnCopyCode = document.getElementById('btn-copy-code');
    this.codeInputs = document.querySelectorAll('.code-char-input');
    this.btnNetJoin = document.getElementById('btn-net-join');
    this.connectedDisplay = document.getElementById('net-connected-display');
    this.statusVal = document.getElementById('net-status-val');
    this.btnNetDisconnect = document.getElementById('btn-net-disconnect');
    this.hostGroup = document.getElementById('net-host-group');
    this.joinGroup = document.getElementById('net-join-group');

    this.arenaRoomCodeDisplay = document.getElementById('arena-room-code-display');
    this.arenaRoomCodeVal = document.getElementById('arena-room-code-val');

    // Game Modifiers (Mods) Toggles
    this.checkTurbo = document.getElementById('mod-turbo');
    this.checkLunar = document.getElementById('mod-lunar');
    this.checkChaos = document.getElementById('mod-chaos');
    this.checkDvd = document.getElementById('mod-dvd');
    this.checkPinball = document.getElementById('mod-pinball');
    this.checkBlackhole = document.getElementById('mod-blackhole');
    this.checkWindstorm = document.getElementById('mod-windstorm');
    
    // Game Launch Modal Elements
    this.gameLaunchModal = document.getElementById('game-launch-modal');
    this.launchGameTitle = document.getElementById('launch-game-title');
    this.btnLaunchGame = document.getElementById('btn-launch-game');
    this.btnCloseLaunchModal = document.getElementById('close-launch-modal');

    // Screen Controls
    this.btnWidescreen = document.getElementById('btn-widescreen');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.arcadeCabinet = document.querySelector('.arcade-cabinet');
    this.canvasWrapper = document.querySelector('.canvas-wrapper');
  }

  /**
   * Binds interaction click events to UI buttons, volume controls, modals, and Netplay connections.
   */
  bindEvents() {
    // First interaction boots Web Audio using capturing listener to ensure audio context is ready
    // before any target click handlers run. We also filter out system/modifier keys to avoid Chrome errors on reload.
    const unlockAudio = (e) => {
      if (e.type === 'click') {
        audio.resume();
        cleanup();
        return;
      }
      const ignoredKeys = [
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'Control', 'Alt', 'Shift', 'Meta', 'Tab'
      ];
      if (!ignoredKeys.includes(e.key)) {
        audio.resume();
        cleanup();
      }
    };
    const cleanup = () => {
      window.removeEventListener('click', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
    };
    window.addEventListener('click', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });

    // Menu Navigation
    this.logoButton.addEventListener('click', () => {
      audio.playMenuTick();
      this.exitActiveGame();
    });

    // Player Mode Switches
    this.btnMode2p.addEventListener('click', () => {
      if (network.isConnected) return; // Lock on active Netplay
      audio.playMenuTick();
      this.playerMode = 2;
      this.syncPlayerModeUI();
    });

    this.btnMode3p.addEventListener('click', () => {
      if (network.isConnected) return;
      audio.playMenuTick();
      this.playerMode = 3;
      this.syncPlayerModeUI();
    });

    this.btnMode4p.addEventListener('click', () => {
      if (network.isConnected) return;
      audio.playMenuTick();
      this.playerMode = 4;
      this.syncPlayerModeUI();
    });

    // Game Cards triggers -> Open Launch Modal
    const openLaunchModal = (gameKey, gameTitle) => {
      audio.playMenuSelect();
      this.pendingGameKey = gameKey;
      this.launchGameTitle.textContent = gameTitle;
      
      // Toggle visibility of game-specific mods
      const launchModalContent = document.getElementById('launch-modal-content');
      if (gameKey === 'blackjack') {
        launchModalContent.style.display = 'none';
      } else {
        launchModalContent.style.display = 'block';
      }

      const dvdContainer = this.checkDvd.parentElement;
      const pinballContainer = this.checkPinball.parentElement;
      const blackholeContainer = this.checkBlackhole.parentElement;
      const windstormContainer = this.checkWindstorm.parentElement;

      const turboContainer = this.checkTurbo.parentElement;
      const lunarContainer = this.checkLunar.parentElement;

      // Reset default displays
      turboContainer.style.display = 'flex';
      lunarContainer.style.display = 'flex';

      // Reset labels and tooltips
      const turboLabel = this.checkTurbo.parentElement.querySelector('.mod-label');
      turboLabel.textContent = '⚡ TURBO';
      turboContainer.title = 'Speed multiplier 1.5x';

      const lunarLabel = this.checkLunar.parentElement.querySelector('.mod-label');
      lunarLabel.textContent = '🌌 LUNAR';
      lunarContainer.title = 'Floaty physics gravity';

      // Apply game-specific renaming and visibility rules
      if (gameKey === 'showdown') {
        // Remove Air Table (old lunar) mode
        lunarContainer.style.display = 'none';
        // Rename Turbo mode to Air Table
        turboLabel.textContent = '🌌 AIR TABLE';
        turboContainer.title = 'Frictionless air hockey table physics';
      } else if (gameKey === 'bumpers') {
        // Remove Turbo mode
        turboContainer.style.display = 'none';
        // Keep Oil Ring (lunar mode)
        lunarLabel.textContent = '🌌 OIL RING';
        lunarContainer.title = 'Slippery oil arena physics';
      } else if (gameKey === 'artillery') {
        // Remove Turbo mode
        turboContainer.style.display = 'none';
      }

      // Reset all special mods
      this.checkPinball.checked = false;
      this.checkBlackhole.checked = false;
      this.checkWindstorm.checked = false;
      this.checkDvd.checked = false;

      dvdContainer.style.display = 'none';
      pinballContainer.style.display = 'none';
      blackholeContainer.style.display = 'none';
      windstormContainer.style.display = 'none';

      if (gameKey === 'showdown') {
        dvdContainer.style.display = 'flex';
        pinballContainer.style.display = 'flex';
      } else if (gameKey === 'bumpers') {
        blackholeContainer.style.display = 'flex';
      } else if (gameKey === 'artillery') {
        windstormContainer.style.display = 'flex';
      }

      this.gameLaunchModal.classList.remove('hidden');
    };

    this.cardShowdown.addEventListener('click', () => {
      if (network.role === 'CLIENT') return;
      openLaunchModal('showdown', `NEON SHOWDOWN (${this.playerMode === 4 ? '2-4P' : (this.playerMode === 3 ? '2-3P' : '2P')})`);
    });
    this.cardBumpers.addEventListener('click', () => {
      if (network.role === 'CLIENT') return;
      openLaunchModal('bumpers', `SUMO BUMPERS (${this.playerMode === 4 ? '2-4P' : (this.playerMode === 3 ? '2-3P' : '2P')})`);
    });
    this.cardArtillery.addEventListener('click', () => {
      if (network.role === 'CLIENT') return;
      if (this.playerMode === 3 || this.playerMode === 4) return;
      openLaunchModal('artillery', 'CYBER ARTILLERY (2P)');
    });
    this.cardBlackjack.addEventListener('click', () => {
      if (network.role === 'CLIENT') return;
      openLaunchModal('blackjack', `NEON BLACKJACK (${this.playerMode === 4 ? '2-4P' : (this.playerMode === 3 ? '2-3P' : '2P')})`);
    });
    if (this.cardLuminousRace) {
      this.cardLuminousRace.addEventListener('click', () => {
        if (network.role === 'CLIENT') return;
        openLaunchModal('luminousrace', `LUMINOUS RACE (${this.playerMode === 4 ? '2-4P' : (this.playerMode === 3 ? '2-3P' : '2P')})`);
      });
    }
    if (this.cardNeonTether) {
      this.cardNeonTether.addEventListener('click', () => {
        if (network.role === 'CLIENT') return;
        if (this.playerMode === 3 || this.playerMode === 4) return;
        openLaunchModal('neontether', 'NEON TETHER (2P)');
      });
    }
    if (this.cardNeonVortex) {
      this.cardNeonVortex.addEventListener('click', () => {
        if (network.role === 'CLIENT') return;
        if (this.playerMode === 2) return;
        openLaunchModal('neonvortex', `NEON VORTEX (${this.playerMode === 4 ? '3-4P' : '3P'})`);
      });
    }
    if (this.cardPrismCapture) {
      this.cardPrismCapture.addEventListener('click', () => {
        if (network.role === 'CLIENT') return;
        openLaunchModal('prismcapture', `PRISM CAPTURE (${this.playerMode === 4 ? '2-4P' : (this.playerMode === 3 ? '2-3P' : '2P')})`);
      });
    }
    if (this.cardCyberSlice) {
      this.cardCyberSlice.addEventListener('click', () => {
        if (network.role === 'CLIENT') return;
        if (this.playerMode > 2) return;
        openLaunchModal('cyberslice', `CYBER SLICE (2P)`);
      });
    }
    if (this.cardNeonChaosBall) {
      this.cardNeonChaosBall.addEventListener('click', () => {
        if (network.role === 'CLIENT') return;
        if (this.playerMode === 2) return;
        openLaunchModal('neonchaosball', `NEON CHAOS BALL (${this.playerMode === 4 ? '3-4P' : '3P'})`);
      });
    }
    if (this.cardSymmetryClash) {
      this.cardSymmetryClash.addEventListener('click', () => {
        if (network.role === 'CLIENT') return;
        if (this.playerMode === 2) return;
        openLaunchModal('symmetryclash', `SYMMETRY CLASH (${this.playerMode === 4 ? '3-4P' : '3P'})`);
      });
    }

    // Launch Modal logic
    this.btnLaunchGame.addEventListener('click', () => {
      audio.playMenuSelect();
      this.gameLaunchModal.classList.add('hidden');
      
      this.loadGame(this.pendingGameKey);
      if (network.isConnected && network.role === 'HOST') {
        network.send({ 
          type: 'START_GAME', 
          gameKey: this.pendingGameKey, 
          mods: {
            turbo: this.checkTurbo.checked,
            lunar: this.checkLunar.checked,
            chaos: this.checkChaos.checked,
            dvd: this.checkDvd.checked,
            pinball: this.checkPinball.checked,
            blackhole: this.checkBlackhole.checked,
            windstorm: this.checkWindstorm.checked,
            playerMode: this.playerMode
          } 
        });
      }
    });
    
    this.btnCloseLaunchModal.addEventListener('click', () => {
      audio.playMenuTick();
      this.gameLaunchModal.classList.add('hidden');
      this.pendingGameKey = null;
    });

    // Keyboard navigation support for game cards
    [this.cardShowdown, this.cardBumpers, this.cardArtillery, this.cardBlackjack, this.cardLuminousRace, this.cardNeonTether, this.cardNeonVortex, this.cardPrismCapture].filter(Boolean).forEach(card => {
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          card.click();
        }
      });
    });

    // Netplay Bindings
    network.onStatusChange = (msg, color) => this.updateNetStatusUI(msg, color);
    network.onConnectionEstablished = (slot) => this.handleNetConnect(slot);
    network.onConnectionLost = (oldRole) => this.handleNetDisconnect(oldRole);
    network.onMessageReceived = (data) => this.handleNetMessage(data);

    this.btnNetHost.addEventListener('click', () => {
      audio.playMenuSelect();
      network.hostGame((code) => {
        this.roomCodeVal.textContent = code;
        this.arenaRoomCodeVal.textContent = code;
        this.roomCodeDisplay.classList.remove('hidden');
        this.btnNetHost.classList.add('hidden');
        
        // Lock player mode switch during Netplay
        this.btnMode2p.classList.add('disabled');
        this.btnMode3p.classList.add('disabled');
      });
    });

    this.btnCopyCode.addEventListener('click', () => {
      audio.playMenuTick();
      const code = this.roomCodeVal.textContent;
      if (code && code !== '----') {
        const onSuccess = () => {
          this.btnCopyCode.textContent = '✅';
          setTimeout(() => this.btnCopyCode.textContent = '📋', 2000);
        };

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(code).then(onSuccess).catch(err => console.error('Clipboard copy failed:', err));
        } else {
          // Fallback for non-HTTPS or file:// protocol execution
          const textArea = document.createElement("textarea");
          textArea.value = code;
          textArea.style.position = "fixed";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          try {
            document.execCommand('copy');
            onSuccess();
          } catch (err) {
            console.error('Fallback copy failed:', err);
          }
          document.body.removeChild(textArea);
        }
      }
    });

    // Auto-advance logic for 4-digit inputs
    this.codeInputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && idx < this.codeInputs.length - 1) {
          this.codeInputs[idx + 1].focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.target.value === '' && idx > 0) {
          this.codeInputs[idx - 1].focus();
        }
      });
    });

    this.btnNetJoin.addEventListener('click', () => {
      audio.playMenuSelect();
      let code = '';
      this.codeInputs.forEach(input => code += input.value.trim().toUpperCase());
      if (code.length === 4) {
        network.joinGame(code);
      }
    });

    this.btnNetDisconnect.addEventListener('click', () => {
      audio.playMenuSelect();
      network.disconnect();
      this.exitActiveGame();
    });

    // Volume adjustment slider
    this.sliderVolume.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value);
      audio.setVolume(vol);
      
      // Update icons depending on level
      if (vol === 0) {
        this.audioIcon.textContent = '🔇';
      } else {
        this.audioIcon.textContent = '🔊';
      }
    });

    // Mute click switch
    this.btnAudio.addEventListener('click', () => {
      const isMuted = audio.toggleMute();
      audio.playMenuTick();
      if (isMuted) {
        this.audioIcon.textContent = '🔇';
        this.sliderVolume.value = 0;
      } else {
        this.audioIcon.textContent = '🔊';
        this.sliderVolume.value = Math.round(audio.volume * 100);
      }
    });

    // Modals guide
    const openHelpModal = () => {
      audio.playMenuSelect();
      this.helpModal.classList.remove('hidden');
    };
    this.btnHelp.addEventListener('click', openHelpModal);
    if (this.btnHowToPlaySide) {
      this.btnHowToPlaySide.addEventListener('click', openHelpModal);
    }

    [this.btnCloseModalX, this.btnCloseModalBtn].forEach(el => {
      el.addEventListener('click', () => {
        audio.playMenuTick();
        this.helpModal.classList.add('hidden');
      });
    });

    // Exit active game arena
    this.btnExitGame.addEventListener('click', () => {
      audio.playMenuTick();
      if (network.role === 'CLIENT') {
        network.disconnect();
      } else {
        this.exitActiveGame();
      }
    });

    // Restart Active Match
    const triggerRestart = () => {
      if (network.role === 'CLIENT') return;
      audio.playMenuSelect();
      this.pauseOverlay.classList.add('hidden');
      this.victoryOverlay.classList.add('hidden');
      this.loadGame(this.activeGameKey);
    };

    this.btnRestartGame.addEventListener('click', triggerRestart);
    this.btnRestartOverlay.addEventListener('click', triggerRestart);
    this.btnNextRound.addEventListener('click', triggerRestart);

    // Score scorecard resets
    this.btnResetStats.addEventListener('click', () => {
      audio.playMenuSelect();
      if (confirm('Are you sure you want to clear the arcade scoreboard?')) {
        this.clearStats();
      }
    });

    // Pausing overlays
    this.btnResume.addEventListener('click', () => {
      if (network.role !== 'CLIENT') this.togglePause(false);
    });
    this.btnMenuReturn.addEventListener('click', () => {
      audio.playMenuTick();
      this.victoryOverlay.classList.add('hidden');
      if (network.role === 'CLIENT') {
        network.disconnect();
      } else {
        this.exitActiveGame();
      }
    });

    // Listen for Escape keyboard toggles to pause
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (this.activeGame && !this.activeGame.winner && network.role !== 'CLIENT') {
          this.togglePause();
        }
      }
    });

    // Screen Controls toggles
    if (this.btnWidescreen) {
      this.btnWidescreen.addEventListener('click', () => {
        audio.playMenuTick();
        this.arcadeCabinet.classList.toggle('widescreen');
      });
    }

    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => {
        audio.playMenuTick();
        if (!document.fullscreenElement) {
          if (this.canvasWrapper.requestFullscreen) {
            this.canvasWrapper.requestFullscreen();
          } else if (this.canvasWrapper.webkitRequestFullscreen) { /* Safari */
            this.canvasWrapper.webkitRequestFullscreen();
          } else if (this.canvasWrapper.msRequestFullscreen) { /* IE11 */
            this.canvasWrapper.msRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
          } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
          }
        }
      });
    }
  }

  /**
   * Synchronises visibility of UI scorecard layers when Player mode shifts.
   */
  syncPlayerModeUI() {
    this.btnMode2p.classList.remove('active', 'btn-cyan');
    this.btnMode3p.classList.remove('active', 'btn-cyan');
    this.btnMode4p.classList.remove('active', 'btn-cyan');

    this.player3StatBlock.classList.add('hidden');
    this.vsDivider2.classList.add('hidden');
    this.player4StatBlock.classList.add('hidden');
    this.vsDivider3.classList.add('hidden');

    this.cardArtillery.classList.remove('disabled-card');
    if (this.cardNeonTether)    this.cardNeonTether.classList.remove('disabled-card');
    if (this.cardNeonVortex)    this.cardNeonVortex.classList.remove('disabled-card');
    if (this.cardPrismCapture)  this.cardPrismCapture.classList.remove('disabled-card');
    if (this.cardCyberSlice)    this.cardCyberSlice.classList.remove('disabled-card');
    if (this.cardNeonChaosBall) this.cardNeonChaosBall.classList.remove('disabled-card');
    if (this.cardSymmetryClash) this.cardSymmetryClash.classList.remove('disabled-card');

    document.querySelectorAll('.yellow-colon, [id^="wins-p3-"]').forEach(el => {
      el.classList.add('hidden');
    });
    document.querySelectorAll('.green-colon, [id^="wins-p4-"]').forEach(el => {
      el.classList.add('hidden');
    });

    if (this.playerMode === 2) {
      this.btnMode2p.classList.add('active', 'btn-cyan');
      if (this.cardNeonVortex) this.cardNeonVortex.classList.add('disabled-card');
      if (this.cardNeonChaosBall) this.cardNeonChaosBall.classList.add('disabled-card');
      if (this.cardSymmetryClash) this.cardSymmetryClash.classList.add('disabled-card');
    } else if (this.playerMode === 3) {
      this.btnMode3p.classList.add('active', 'btn-cyan');
      this.player3StatBlock.classList.remove('hidden');
      this.vsDivider2.classList.remove('hidden');
      this.cardArtillery.classList.add('disabled-card');
      if (this.cardNeonTether) this.cardNeonTether.classList.add('disabled-card');
      if (this.cardCyberSlice) this.cardCyberSlice.classList.add('disabled-card');
      document.querySelectorAll('.yellow-colon, [id^="wins-p3-"]').forEach(el => {
        el.classList.remove('hidden');
      });
    } else if (this.playerMode === 4) {
      this.btnMode4p.classList.add('active', 'btn-cyan');
      this.player3StatBlock.classList.remove('hidden');
      this.vsDivider2.classList.remove('hidden');
      this.player4StatBlock.classList.remove('hidden');
      this.vsDivider3.classList.remove('hidden');
      this.cardArtillery.classList.add('disabled-card');
      if (this.cardNeonTether) this.cardNeonTether.classList.add('disabled-card');
      if (this.cardCyberSlice) this.cardCyberSlice.classList.add('disabled-card');
      document.querySelectorAll('.yellow-colon, [id^="wins-p3-"]').forEach(el => {
        el.classList.remove('hidden');
      });
      document.querySelectorAll('.green-colon, [id^="wins-p4-"]').forEach(el => {
        el.classList.remove('hidden');
      });
    }
  }

  /**
   * Initializes and structures the dynamic play arena based on choice.
   */
  loadGame(gameKey, isClient = false, hostMods = null) {
    if (this.activeGame) {
      this.activeGame.paused = true;
      if (this.activeGame.cleanup) this.activeGame.cleanup();
      this.activeGame = null;
    }

    this.activeGameKey = gameKey;
    this.isNetworkClient = isClient;
    this.input.setGameActive(true);

    this.pauseOverlay.classList.add('hidden');
    this.victoryOverlay.classList.add('hidden');
    
    // Visual toggles for client roles
    if (isClient) {
      this.btnRestartGame.classList.add('hidden');
      this.btnRestartOverlay.classList.add('hidden');
      this.btnNextRound.classList.add('hidden');
    } else {
      this.btnRestartGame.classList.remove('hidden');
      this.btnRestartOverlay.classList.remove('hidden');
      this.btnNextRound.classList.remove('hidden');
    }

    // Capture Mods & Player mode
    const mods = hostMods || {
      turbo: this.checkTurbo.checked,
      lunar: this.checkLunar.checked,
      chaos: this.checkChaos.checked,
      dvd: this.checkDvd.checked,
      pinball: this.checkPinball.checked,
      blackhole: this.checkBlackhole.checked,
      windstorm: this.checkWindstorm.checked,
      playerMode: this.playerMode
    };

    this.playerMode = mods.playerMode;
    this.syncPlayerModeUI();

    // Visual text adjustments and active game constructor spawning
    if (gameKey === 'showdown') {
      this.activeGameTitle.textContent = this.playerMode === 4 ? 'NEON SHOWDOWN (2-4P)' : (this.playerMode === 3 ? 'NEON SHOWDOWN (2-3P)' : 'NEON SHOWDOWN (2P)');
      this.activeGameTitle.className = 'active-game-title neon-text-cyan';
      this.controlsSummaryText.innerHTML = isClient 
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : (this.playerMode === 4
          ? `<span>P1: WASD</span> <span>P2: Arrows</span> <span>P3: IJKL</span> <span>P4: TFGH</span>`
          : (this.playerMode === 3 
            ? `<span>P1: WASD</span> <span>P2: Arrows</span> <span>P3: IJKL</span>`
            : `<span>P1: WASD</span> <span>P2: Arrows</span>`));
           
      this.activeGame = new GameShowdown(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'bumpers') {
      this.activeGameTitle.textContent = this.playerMode === 4 ? 'SUMO BUMPERS (2-4P)' : (this.playerMode === 3 ? 'SUMO BUMPERS (2-3P)' : 'SUMO BUMPERS (2P)');
      this.activeGameTitle.className = 'active-game-title neon-text-magenta';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : (this.playerMode === 4
          ? `<span>P1: WASD+SPACE</span> <span>P2: Arrows+ENTER</span> <span>P3: IJKL+U</span> <span>P4: TFGH+Y</span>`
          : (this.playerMode === 3
            ? `<span>P1: WASD+SPACE</span> <span>P2: Arrows+ENTER</span> <span>P3: IJKL+U</span>`
            : `<span>P1: WASD+SPACE</span> <span>P2: Arrows+ENTER</span>`));
           
      this.activeGame = new GameBumpers(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'artillery') {
      this.activeGameTitle.textContent = 'CYBER ARTILLERY (2P)';
      this.activeGameTitle.className = 'active-game-title neon-text-orange';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : `<span>Aim: A,D/◀,▶ | Power: W,S/▲,▼ | Move: Z,X/,,. | Fire: Space/Enter</span>`;
      this.activeGame = new GameArtillery(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'blackjack') {
      this.activeGameTitle.textContent = this.playerMode === 4 ? 'NEON BLACKJACK (2-4P)' : (this.playerMode === 3 ? 'NEON BLACKJACK (2-3P)' : 'NEON BLACKJACK (2P)');
      this.activeGameTitle.className = 'active-game-title neon-text-green';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : `<span>Controls: Mouse Only</span>`;
      this.activeGame = new GameBlackjack(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'luminousrace') {
      this.activeGameTitle.textContent = this.playerMode === 4 ? 'LUMINOUS RACE (2-4P)' : (this.playerMode === 3 ? 'LUMINOUS RACE (2-3P)' : 'LUMINOUS RACE (2P)');
      this.activeGameTitle.className = 'active-game-title neon-text-purple';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : (this.playerMode === 4
          ? `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span> <span>P3: IJKL+U</span> <span>P4: TFGH+Y</span>`
          : (this.playerMode === 3
            ? `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span> <span>P3: IJKL+U</span>`
            : `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span>`));
      this.activeGame = new GameLuminousRace(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'neontether') {
      this.activeGameTitle.textContent = 'NEON TETHER (2P)';
      this.activeGameTitle.className = 'active-game-title neon-text-yellow';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : `<span>P1: WASD | Flip: Space</span> <span>P2: Arrows | Flip: Enter</span>`;
      this.activeGame = new GameNeonTether(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'neonvortex') {
      this.activeGameTitle.textContent = this.playerMode === 4 ? 'NEON VORTEX (3-4P)' : 'NEON VORTEX (3P)';
      this.activeGameTitle.className = 'active-game-title neon-text-teal';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : (this.playerMode === 4
          ? `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span> <span>P3: IJKL+U</span> <span>P4: TFGH+Y</span>`
          : `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span> <span>P3: IJKL+U</span>`);
      this.activeGame = new GameNeonVortex(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'prismcapture') {
      this.activeGameTitle.textContent = this.playerMode === 4 ? 'PRISM CAPTURE (2-4P)' : (this.playerMode === 3 ? 'PRISM CAPTURE (2-3P)' : 'PRISM CAPTURE (2P)');
      this.activeGameTitle.className = 'active-game-title neon-text-rose';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : (this.playerMode === 4
          ? `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span> <span>P3: IJKL+U</span> <span>P4: TFGH+Y</span>`
          : (this.playerMode === 3
            ? `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span> <span>P3: IJKL+U</span>`
            : `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span>`));
      this.activeGame = new GamePrismCapture(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'cyberslice') {
      this.activeGameTitle.textContent = 'CYBER SLICE (2P)';
      this.activeGameTitle.className = 'active-game-title neon-text-cyan';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span>`;
      this.activeGame = new GameCyberSlice(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'neonchaosball') {
      this.activeGameTitle.textContent = this.playerMode === 4 ? 'NEON CHAOS BALL (3-4P)' : 'NEON CHAOS BALL (3P)';
      this.activeGameTitle.className = 'active-game-title neon-text-magenta';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : (this.playerMode === 4
          ? `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span> <span>P3: IJKL+U</span> <span>P4: TFGH+Y</span>`
          : `<span>P1: WASD+SPC</span> <span>P2: Arrows+ENT</span> <span>P3: IJKL+U</span>`);
      this.activeGame = new GameNeonChaosBall(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    } else if (gameKey === 'symmetryclash') {
      this.activeGameTitle.textContent = this.playerMode === 4 ? 'SYMMETRY CLASH (3-4P)' : 'SYMMETRY CLASH (3P)';
      this.activeGameTitle.className = 'active-game-title neon-text-yellow';
      this.controlsSummaryText.innerHTML = isClient
        ? `<span>REMOTE MULTIPLAYER // HOST CONTROLS CART</span>`
        : (this.playerMode === 4
          ? `<span>P1: A,D+W</span> <span>P2: ◀,▶+▲</span> <span>P3: J,L+I</span> <span>P4: F,H+T</span>`
          : `<span>P1: A,D+W</span> <span>P2: ◀,▶+▲</span> <span>P3: J,L+I</span>`);
      this.activeGame = new GameSymmetryClash(this.canvas, this.input, (winner, score) => this.handleGameOver(winner, score), mods);
    }

    if (this.isHostActive()) {
      this.arenaRoomCodeDisplay.classList.remove('hidden');
    } else {
      this.arenaRoomCodeDisplay.classList.add('hidden');
    }

    if (this.activeGame) {
      this.activeGame.networkStateQueue = [];
    }

    audio.playMenuSelect();

    this.selectorScreen.classList.remove('active');
    this.arenaScreen.classList.add('active');
  }

  /**
   * Resets active loops and returns to core game selection grids.
   */
  exitActiveGame() {
    if (this.activeGame) {
      this.activeGame.paused = true;
      if (this.activeGame.cleanup) this.activeGame.cleanup();
      this.activeGame = null;
    }
    this.activeGameKey = null;
    this.isNetworkClient = false;
    this.input.setGameActive(false);

    this.pauseOverlay.classList.add('hidden');
    this.victoryOverlay.classList.add('hidden');

    this.arenaScreen.classList.remove('active');
    this.selectorScreen.classList.add('active');
    
    // Disable Widescreen and Fullscreen upon returning to menu
    if (this.arcadeCabinet && this.arcadeCabinet.classList.contains('widescreen')) {
      this.arcadeCabinet.classList.remove('widescreen');
    }
    if (document.fullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
      }
    }

    // If hosting, broadcast the menu exit state to clients!
    if (network.isConnected && network.role === 'HOST') {
      network.send({ type: 'EXIT_GAME' });
    }
  }

  /**
   * Standard keyboard Escape pauser toggler.
   */
  togglePause(forceState) {
    if (!this.activeGame || network.role === 'CLIENT') return;

    const targetState = forceState !== undefined ? forceState : !this.activeGame.paused;
    this.activeGame.paused = targetState;

    audio.playMenuTick();

    if (targetState) {
      this.pauseOverlay.classList.remove('hidden');
    } else {
      this.pauseOverlay.classList.add('hidden');
    }
  }

  /**
   * Callback when any active game runs a victory event.
   */
  handleGameOver(winnerKey, scoreStr) {
    this.activeGame.paused = true;

    // Award Stats scorecard (only Host/Local tracks scorecard stats to prevent duplicates!)
    if (network.role !== 'CLIENT') {
      this.stats[this.activeGameKey][winnerKey]++;
      this.saveStats();
      this.renderStats();
    }

    // Setup Victory banners
    let winnerName = 'PLAYER 1 (CYAN FORCE)';
    if (winnerKey === 'p2') winnerName = 'PLAYER 2 (PINK SHOCK)';
    else if (winnerKey === 'p3') winnerName = 'PLAYER 3 (YELLOW SPARK)';
    else if (winnerKey === 'p4') winnerName = 'PLAYER 4 (GREEN VAPOR)';

    this.victoryBanner.textContent = `${winnerName} WINS!`;
    this.victoryDetails.textContent = `FINAL SCORE: ${scoreStr}`;

    const victoryBox = this.victoryOverlay.querySelector('.victory-box');
    const nextRoundBtn = document.getElementById('next-round-btn');

    if (victoryBox) {
      if (winnerKey === 'p1') {
        victoryBox.style.borderColor = 'var(--neon-cyan)';
        victoryBox.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.2)';
        this.victoryBanner.style.color = 'var(--neon-cyan)';
        this.victoryBanner.style.textShadow = '0 0 12px var(--neon-cyan-glow)';
        if (nextRoundBtn) nextRoundBtn.className = 'arcade-btn pulse-glow-cyan';
      } else if (winnerKey === 'p2') {
        victoryBox.style.borderColor = 'var(--neon-magenta)';
        victoryBox.style.boxShadow = '0 0 25px rgba(255, 0, 127, 0.2)';
        this.victoryBanner.style.color = 'var(--neon-magenta)';
        this.victoryBanner.style.textShadow = '0 0 12px var(--neon-magenta-glow)';
        if (nextRoundBtn) nextRoundBtn.className = 'arcade-btn pulse-glow-magenta';
      } else if (winnerKey === 'p3') {
        victoryBox.style.borderColor = 'var(--neon-yellow)';
        victoryBox.style.boxShadow = '0 0 25px rgba(255, 255, 0, 0.2)';
        this.victoryBanner.style.color = 'var(--neon-yellow)';
        this.victoryBanner.style.textShadow = '0 0 12px var(--neon-yellow-glow)';
        if (nextRoundBtn) nextRoundBtn.className = 'arcade-btn pulse-glow-yellow';
      } else {
        victoryBox.style.borderColor = 'var(--neon-green)';
        victoryBox.style.boxShadow = '0 0 25px rgba(57, 255, 20, 0.2)';
        this.victoryBanner.style.color = 'var(--neon-green)';
        this.victoryBanner.style.textShadow = '0 0 12px var(--neon-green-glow)';
        if (nextRoundBtn) nextRoundBtn.className = 'arcade-btn pulse-glow-green';
      }
    }

    this.victoryOverlay.classList.remove('hidden');
  }

  /* ==========================================================================
     SIGNALING MULTIPLAYER NETWORK SYSTEMS
     ========================================================================== */

  updateNetStatusUI(msg, colorClass) {
    if (!this.statusVal) return;
    this.statusVal.textContent = msg;
    this.statusVal.className = `net-status-green ${colorClass}-text`;
  }

  handleNetConnect(assignedSlot) {
    audio.playPowerup();

    this.hostStateSeq = 0;
    this.clientInputSeq = 0;
    this.lastReceivedStateSeq = 0;
    this.lastReceivedInputSeqP2 = 0;
    this.lastReceivedInputSeqP3 = 0;

    this.hostGroup.classList.add('hidden');
    this.joinGroup.classList.add('hidden');
    document.getElementById('net-divider-text').classList.add('hidden');
    this.connectedDisplay.classList.remove('hidden');

    const p1Label = document.querySelector('.player-1 .player-name');
    const p2Label = document.querySelector('.player-2 .player-name');
    const p3Label = document.querySelector('.player-3 .player-name');
    const p4Label = document.querySelector('.player-4 .player-name');

    if (network.role === 'HOST') {
      p1Label.innerHTML = 'HOST (P1) <span class="cyan-text">✔</span>';
      
      const p2Active = network.slots.p2;
      const p3Active = network.slots.p3;
      const p4Active = network.slots.p4;
      p2Label.innerHTML = p2Active ? 'REMOTE (P2) <span class="magenta-text">✔</span>' : 'AWAITING P2...';
      p3Label.innerHTML = p3Active ? 'REMOTE (P3) <span class="yellow-text">✔</span>' : 'AWAITING P3...';
      p4Label.innerHTML = p4Active ? 'REMOTE (P4) <span class="green-text">✔</span>' : 'AWAITING P4...';
    } else {
      // Client
      this.mySlot = assignedSlot; // 'p2', 'p3', or 'p4'
      this.playerMode = (assignedSlot === 'p4') ? 4 : ((assignedSlot === 'p3') ? 3 : this.playerMode);
      this.syncPlayerModeUI();

      p1Label.innerHTML = 'REMOTE (P1)';
      p2Label.innerHTML = (assignedSlot === 'p2') ? 'CLIENT (P2) <span class="magenta-text">✔</span>' : 'REMOTE (P2)';
      p3Label.innerHTML = (assignedSlot === 'p3') ? 'CLIENT (P3) <span class="yellow-text">✔</span>' : 'REMOTE (P3)';
      p4Label.innerHTML = (assignedSlot === 'p4') ? 'CLIENT (P4) <span class="green-text">✔</span>' : 'REMOTE (P4)';
    }
  }

  handleNetDisconnect(oldRole) {
    audio.playBounce();

    this.hostGroup.classList.remove('hidden');
    this.joinGroup.classList.remove('hidden');
    document.getElementById('net-divider-text').classList.remove('hidden');
    this.btnNetHost.classList.remove('hidden');
    this.roomCodeDisplay.classList.add('hidden');
    this.connectedDisplay.classList.add('hidden');
    this.codeInputs.forEach(input => input.value = '');

    // Re-enable player mode switches
    this.btnMode2p.classList.remove('disabled');
    this.btnMode3p.classList.remove('disabled');
    this.btnMode4p.classList.remove('disabled');

    const p1Label = document.querySelector('.player-1 .player-name');
    const p2Label = document.querySelector('.player-2 .player-name');
    const p3Label = document.querySelector('.player-3 .player-name');
    const p4Label = document.querySelector('.player-4 .player-name');
    if (p1Label) p1Label.textContent = 'CYAN FORCE';
    if (p2Label) p2Label.textContent = 'PINK SHOCK';
    if (p3Label) p3Label.textContent = 'YELLOW SPARK';
    if (p4Label) p4Label.textContent = 'GREEN VAPOR';

    this.mySlot = null;

    if (this.activeGame) {
      this.exitActiveGame();
    }
  }

  handleNetMessage(packet) {
    if (packet.type === 'PLAYER_CONNECTED' || packet.type === 'PLAYER_DISCONNECTED') {
      this.handleNetConnect(this.mySlot);
    } else if (packet.type === 'INPUT_SYNC') {
      // Only the HOST needs INPUT_SYNC to read remote player inputs for physics.
      // Clients don't run physics — they render from STATE packets.
      // Also: only apply REMOTE slots (p2, p3, p4). Applying p1 back would overwrite
      // the host's local keyboard readings since p1 remaps WASD→Arrow key names,
      // colliding with p2's Arrow key names.
      if (network.role === 'HOST' && packet.inputs) {
        for (const slot of ['p2', 'p3', 'p4']) {
          const slotKeys = packet.inputs[slot];
          if (slotKeys && typeof slotKeys === 'object') {
            for (const key in slotKeys) {
              this.input.keys[key] = slotKeys[key];
            }
          }
        }
      }
    } else if (packet.type === 'STATE') {
      // Authoritative host state – apply on client side
      if (network.role === 'CLIENT' && this.activeGame) {
        // Apply sequence check to prevent out-of-order jitter
        if (packet.seq && packet.seq <= this.lastReceivedStateSeq) return;
        this.lastReceivedStateSeq = packet.seq || 0;

        // Apply full game state
        if (packet.gameState) {
          this.activeGame.applyNetworkState(packet.gameState);
        }

        // Sync scores
        if (packet.scores) {
          this.activeGame.scores = packet.scores;
        }

        // Sync pause state
        if (packet.paused !== undefined) {
          this.activeGame.paused = packet.paused;
          if (packet.paused) {
            this.pauseOverlay.classList.remove('hidden');
          } else {
            this.pauseOverlay.classList.add('hidden');
          }
        }

        // Sync winner / game over
        if (packet.winner && !this.activeGame.winner) {
          this.activeGame.winner = packet.winner;
          const scoreStr = packet.scores
            ? (packet.scores.p4 !== undefined
              ? `${packet.scores.p1} - ${packet.scores.p2} - ${packet.scores.p3} - ${packet.scores.p4}`
              : (packet.scores.p3 !== undefined
                ? `${packet.scores.p1} - ${packet.scores.p2} - ${packet.scores.p3}`
                : `${packet.scores.p1} - ${packet.scores.p2}`))
            : '';
          this.handleGameOver(packet.winner, scoreStr);
        }

        // Sync stats scoreboard
        if (packet.stats) {
          this.stats = packet.stats;
          this.renderStats();
        }

        // Replay sound effects triggered on host
        if (packet.sounds && packet.sounds.length > 0) {
          packet.sounds.forEach(s => {
            audio.playDirect(s);
          });
        }

        // Replay particle explosions triggered on host
        if (packet.effects && packet.effects.length > 0 && this.activeGame.particles) {
          packet.effects.forEach(e => {
            this.activeGame.particles.spawnExplosion(e.x, e.y, e.color, e.count, e.speedScale, e.gravity);
          });
        }

        // Replay screen shake
        if (packet.shake) {
          triggerScreenShake();
        }
      }
    } else if (packet.type === 'LOAD_GAME') {
      // Clients explicitly load the game when the server sends this
      this.loadGame(packet.gameKey, network.role === 'CLIENT', packet.mods);
    } else if (packet.type === 'START_GAME') {
      // Host has decided to start this game – load it locally and apply the mods
      this.loadGame(packet.gameKey, network.role === 'CLIENT', packet.mods);
    } else if (packet.type === 'EXIT_GAME') {
      if (network.role === 'CLIENT') {
        this.exitActiveGame();
      }
    }
  }

  /* ==========================================================================
     ARCADE STATE PERSISTENCE (LOCAL STORAGE)
     ========================================================================== */

  loadStats() {
    const rawStats = localStorage.getItem('duel_neon_stats');
    if (rawStats) {
      try {
        const parsed = JSON.parse(rawStats);
        // Guarantee P3 and P4 elements are initialized
        for (const gameKey in parsed) {
          if (!parsed[gameKey].p3) parsed[gameKey].p3 = 0;
          if (!parsed[gameKey].p4) parsed[gameKey].p4 = 0;
        }
        // Guarantee new game keys exist (backward compat with older saves)
        if (!parsed.luminousrace)  parsed.luminousrace  = { p1: 0, p2: 0, p3: 0, p4: 0 };
        if (!parsed.neontether)    parsed.neontether    = { p1: 0, p2: 0, p3: 0, p4: 0 };
        if (!parsed.neonvortex)    parsed.neonvortex    = { p1: 0, p2: 0, p3: 0, p4: 0 };
        if (!parsed.prismcapture)  parsed.prismcapture  = { p1: 0, p2: 0, p3: 0, p4: 0 };
        this.stats = parsed;
      } catch (e) {
        console.error("Scoreboard JSON stats corrupted, resetting.", e);
      }
    }
    this.renderStats();
  }

  saveStats() {
    localStorage.setItem('duel_neon_stats', JSON.stringify(this.stats));
  }

  clearStats() {
    this.stats = {
      showdown: { p1: 0, p2: 0, p3: 0, p4: 0 },
      bumpers: { p1: 0, p2: 0, p3: 0, p4: 0 },
      artillery: { p1: 0, p2: 0, p3: 0, p4: 0 },
      blackjack: { p1: 0, p2: 0, p3: 0, p4: 0 },
      luminousrace:  { p1: 0, p2: 0, p3: 0, p4: 0 },
      neontether:    { p1: 0, p2: 0, p3: 0, p4: 0 },
      neonvortex:    { p1: 0, p2: 0, p3: 0, p4: 0 },
      prismcapture:  { p1: 0, p2: 0, p3: 0, p4: 0 },
      cyberslice:    { p1: 0, p2: 0, p3: 0, p4: 0 },
      neonchaosball: { p1: 0, p2: 0, p3: 0, p4: 0 },
      symmetryclash: { p1: 0, p2: 0, p3: 0, p4: 0 }
    };
    this.saveStats();
    this.renderStats();
  }

  renderStats() {
    // Neon Showdown
    document.getElementById('wins-p1-showdown').textContent = this.stats.showdown.p1;
    document.getElementById('wins-p2-showdown').textContent = this.stats.showdown.p2;
    document.getElementById('wins-p3-showdown').textContent = this.stats.showdown.p3 || 0;
    document.getElementById('wins-p4-showdown').textContent = this.stats.showdown.p4 || 0;

    // Sumo Bumpers
    document.getElementById('wins-p1-bumpers').textContent = this.stats.bumpers.p1;
    document.getElementById('wins-p2-bumpers').textContent = this.stats.bumpers.p2;
    document.getElementById('wins-p3-bumpers').textContent = this.stats.bumpers.p3 || 0;
    document.getElementById('wins-p4-bumpers').textContent = this.stats.bumpers.p4 || 0;

    // Cyber Artillery
    document.getElementById('wins-p1-artillery').textContent = this.stats.artillery.p1;
    document.getElementById('wins-p2-artillery').textContent = this.stats.artillery.p2;
    document.getElementById('wins-p3-artillery').textContent = this.stats.artillery.p3 || 0;
    document.getElementById('wins-p4-artillery').textContent = this.stats.artillery.p4 || 0;

    // Neon Blackjack
    document.getElementById('wins-p1-blackjack').textContent = this.stats.blackjack.p1;
    document.getElementById('wins-p2-blackjack').textContent = this.stats.blackjack.p2;
    document.getElementById('wins-p3-blackjack').textContent = this.stats.blackjack.p3 || 0;
    document.getElementById('wins-p4-blackjack').textContent = this.stats.blackjack.p4 || 0;

    // Luminous Race
    if (this.stats.luminousrace && document.getElementById('wins-p1-luminousrace')) {
      document.getElementById('wins-p1-luminousrace').textContent = this.stats.luminousrace.p1 || 0;
      document.getElementById('wins-p2-luminousrace').textContent = this.stats.luminousrace.p2 || 0;
      document.getElementById('wins-p3-luminousrace').textContent = this.stats.luminousrace.p3 || 0;
      document.getElementById('wins-p4-luminousrace').textContent = this.stats.luminousrace.p4 || 0;
    }

    // Neon Tether
    if (this.stats.neontether && document.getElementById('wins-p1-neontether')) {
      document.getElementById('wins-p1-neontether').textContent = this.stats.neontether.p1 || 0;
      document.getElementById('wins-p2-neontether').textContent = this.stats.neontether.p2 || 0;
    }

    // Neon Vortex
    if (this.stats.neonvortex && document.getElementById('wins-p1-neonvortex')) {
      document.getElementById('wins-p1-neonvortex').textContent = this.stats.neonvortex.p1 || 0;
      document.getElementById('wins-p2-neonvortex').textContent = this.stats.neonvortex.p2 || 0;
      document.getElementById('wins-p3-neonvortex').textContent = this.stats.neonvortex.p3 || 0;
      document.getElementById('wins-p4-neonvortex').textContent = this.stats.neonvortex.p4 || 0;
    }

    // Prism Capture
    if (this.stats.prismcapture && document.getElementById('wins-p1-prismcapture')) {
      document.getElementById('wins-p1-prismcapture').textContent = this.stats.prismcapture.p1 || 0;
      document.getElementById('wins-p2-prismcapture').textContent = this.stats.prismcapture.p2 || 0;
      document.getElementById('wins-p3-prismcapture').textContent = this.stats.prismcapture.p3 || 0;
      document.getElementById('wins-p4-prismcapture').textContent = this.stats.prismcapture.p4 || 0;
    }

    // Cyber Slice
    if (this.stats.cyberslice && document.getElementById('wins-p1-cyberslice')) {
      document.getElementById('wins-p1-cyberslice').textContent = this.stats.cyberslice.p1 || 0;
      document.getElementById('wins-p2-cyberslice').textContent = this.stats.cyberslice.p2 || 0;
    }

    // Neon Chaos Ball
    if (this.stats.neonchaosball && document.getElementById('wins-p1-neonchaosball')) {
      document.getElementById('wins-p1-neonchaosball').textContent = this.stats.neonchaosball.p1 || 0;
      document.getElementById('wins-p2-neonchaosball').textContent = this.stats.neonchaosball.p2 || 0;
      document.getElementById('wins-p3-neonchaosball').textContent = this.stats.neonchaosball.p3 || 0;
      document.getElementById('wins-p4-neonchaosball').textContent = this.stats.neonchaosball.p4 || 0;
    }

    // Symmetry Clash
    if (this.stats.symmetryclash && document.getElementById('wins-p1-symmetryclash')) {
      document.getElementById('wins-p1-symmetryclash').textContent = this.stats.symmetryclash.p1 || 0;
      document.getElementById('wins-p2-symmetryclash').textContent = this.stats.symmetryclash.p2 || 0;
      document.getElementById('wins-p3-symmetryclash').textContent = this.stats.symmetryclash.p3 || 0;
      document.getElementById('wins-p4-symmetryclash').textContent = this.stats.symmetryclash.p4 || 0;
    }
  }

  isHostActive() {
    return network.isConnected && network.role === 'HOST';
  }

  /* ==========================================================================
     CENTRAL TICK HEARTBEAT ENGINE
     ========================================================================== */

  startGameLoop() {
    let lastTime = performance.now();
    let accumulator = 0;
    const step = 1000 / 60; // Fixed 60fps step (16.66ms)

    const frame = (currentTime) => {
      // 1. Calculate Delta Time
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      accumulator += deltaTime;

      // 2. Poll Connected Gamepads
      const gamepadConnected = this.input.pollGamepads();
      if (gamepadConnected) {
        if (this.gamepadDot) this.gamepadDot.className = 'pulse-dot green';
        if (this.gamepadText) {
          this.gamepadText.textContent = 'GAMEPADS ACTIVE';
          this.gamepadText.className = 'cyan-text';
        }
      } else {
        if (this.gamepadDot) this.gamepadDot.className = 'pulse-dot grey';
        if (this.gamepadText) {
          this.gamepadText.textContent = 'NO GAMEPADS DETECTED';
          this.gamepadText.className = '';
        }
      }

      // 3. Client sends local keystrokes to Server
      if (network.isConnected) {
        let clientKeys = {};
        if (this.mySlot === 'p2' || (this.mySlot === null && network.role === 'HOST')) {
          clientKeys = {
            ArrowUp: this.input.isPressed('ArrowUp') || this.input.isPressed('KeyW'),
            ArrowDown: this.input.isPressed('ArrowDown') || this.input.isPressed('KeyS'),
            ArrowLeft: this.input.isPressed('ArrowLeft') || this.input.isPressed('KeyA'),
            ArrowRight: this.input.isPressed('ArrowRight') || this.input.isPressed('KeyD'),
            Comma: this.input.isPressed('Comma') || this.input.isPressed(',') || this.input.isPressed('KeyZ'),
            Period: this.input.isPressed('Period') || this.input.isPressed('.') || this.input.isPressed('KeyX'),
            Enter: this.input.isPressed('Enter') || this.input.isPressed('Space'),
            Shift: this.input.isPressed('Shift') || this.input.isPressed('ShiftLeft') || this.input.isPressed('KeyQ')
          };
        } else if (this.mySlot === 'p3') {
          clientKeys = {
            KeyI: this.input.isPressed('KeyI') || this.input.isPressed('KeyW'),
            KeyK: this.input.isPressed('KeyK') || this.input.isPressed('KeyS'),
            KeyJ: this.input.isPressed('KeyJ') || this.input.isPressed('KeyA'),
            KeyL: this.input.isPressed('KeyL') || this.input.isPressed('KeyD'),
            KeyN: this.input.isPressed('KeyN') || this.input.isPressed('n') || this.input.isPressed('KeyZ'),
            KeyM: this.input.isPressed('KeyM') || this.input.isPressed('m') || this.input.isPressed('KeyX'),
            KeyU: this.input.isPressed('KeyU') || this.input.isPressed('KeyO') || this.input.isPressed('Space') || this.input.isPressed('KeyQ')
          };
        } else if (this.mySlot === 'p4') {
          clientKeys = {
            KeyT: this.input.isPressed('KeyT') || this.input.isPressed('KeyW'),
            KeyG: this.input.isPressed('KeyG') || this.input.isPressed('KeyS'),
            KeyF: this.input.isPressed('KeyF') || this.input.isPressed('KeyA'),
            KeyH: this.input.isPressed('KeyH') || this.input.isPressed('KeyD'),
            KeyY: this.input.isPressed('KeyY') || this.input.isPressed('Space') || this.input.isPressed('KeyQ')
          };
        }
        const keysStr = JSON.stringify(clientKeys);
        if (keysStr !== this.lastSentKeysStr) {
          this.lastSentKeysStr = keysStr;
          network.send({ type: 'INPUT', keys: clientKeys });
        }
      }

      // 4. PHYSICS UPDATE (Fixed Timestep Accumulator)
      if (this.activeGame) {
        // High-DPI canvas resizing while protecting 8:5 aspect ratio
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const scaleX = rect.width / 800;
          const scaleY = rect.height / 500;
          const scale = Math.min(scaleX, scaleY) * dpr;
          const targetW = Math.round(800 * scale);
          const targetH = Math.round(500 * scale);
          if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
            this.canvas.width = targetW;
            this.canvas.height = targetH;
          }
        }

        if (this.isNetworkClient) {
          // Client: Render-only — the authoritative host sends STATE packets
          // which are applied in handleNetMessage. We only update particles and render.
          if (this.activeGame.particles) {
            this.activeGame.particles.update();
          }

          const ctx = this.canvas.getContext('2d');
          ctx.save();
          ctx.scale(this.canvas.width / 800, this.canvas.height / 500);
          this.activeGame.render();
          ctx.restore();

          accumulator = 0; // Consume accumulator since we don't run local physics
        } else {
          // Host / Offline: Run physics at a fixed 60Hz regardless of render rate
          while (accumulator >= step) {
            if (!this.activeGame.paused) {
              this.activeGame.tick();
            }
            accumulator -= step;
          }

          const ctx = this.canvas.getContext('2d');
          ctx.save();
          ctx.scale(this.canvas.width / 800, this.canvas.height / 500);
          this.activeGame.render();
          ctx.restore();

          // Authoritative Host broadcasts state at ~20hz to reduce bandwidth
          if (network.isConnected && network.role === 'HOST') {
            // Accumulate event data between send frames
            const frameSounds = audio.flushSounds();
            const frameEffects = this.activeGame.particles.flushExplosions();
            const frameShake = flushScreenShake();

            if (!this._pendingSounds) this._pendingSounds = [];
            if (!this._pendingEffects) this._pendingEffects = [];
            if (frameSounds.length > 0) this._pendingSounds.push(...frameSounds);
            if (frameEffects.length > 0) this._pendingEffects.push(...frameEffects);
            if (frameShake) this._pendingShake = true;

            this._netSendCounter = (this._netSendCounter || 0) + 1;
            if (this._netSendCounter >= 3) { // Every 3rd frame ≈ 20hz
              this._netSendCounter = 0;

              const statePacket = {
                type: 'STATE',
                seq: ++this.hostStateSeq,
                scores: this.activeGame.scores,
                winner: this.activeGame.winner,
                paused: this.activeGame.paused,
                gameState: this.activeGame.getState()
              };

              // Attach event data only when present
              if (this._pendingSounds.length > 0) {
                statePacket.sounds = this._pendingSounds;
                this._pendingSounds = [];
              }
              if (this._pendingEffects.length > 0) {
                statePacket.effects = this._pendingEffects;
                this._pendingEffects = [];
              }
              if (this._pendingShake) {
                statePacket.shake = true;
                this._pendingShake = false;
              }

              // Send stats only when they change (on game over)
              if (this.activeGame.winner) {
                statePacket.stats = this.stats;
              }

              network.send(statePacket);
            }
          }
        }
      }

      this.loopId = requestAnimationFrame(frame);
    };

    this.loopId = requestAnimationFrame(frame);
  }
}

// Initialise system once DOM loads
window.addEventListener('DOMContentLoaded', () => {
  window.arcade = new ArcadeSystem();
});
