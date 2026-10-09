import { ParticleSystem, triggerScreenShake } from './engine.js';
import { audio } from './audio.js';

/* ======================================================================
   NEON BLACKJACK — 2D Blackjack for the DUEL NEON arcade platform.
   Supports 2–4 players with full mechanics: Hit, Stand, Double Down,
   Split, Insurance. 6-deck shoe, dealer stands on all 17s.
   ====================================================================== */

// ─── Card Constants ────────────────────────────────────────────────────
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = { A: 11, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 10, Q: 10, K: 10 };
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLORS = { hearts: '#ff3366', diamonds: '#ff3366', clubs: '#aab8ff', spades: '#aab8ff' };

const CARD_W = 46;
const CARD_H = 66;
const CARD_OVERLAP = 20;
const MAX_HAND_WIDTH = 140;

// ─── Player Palette (same as DUEL NEON core) ───────────────────────────
const PLAYER_COLORS = ['#00f0ff', '#ff007f', '#ffff00', '#39ff14'];
const PLAYER_NAMES = ['CYAN FORCE', 'PINK SHOCK', 'YELLOW SPARK', 'GREEN VAPOR'];
const PLAYER_GLOWS = [
  'rgba(0,240,255,0.5)', 'rgba(255,0,127,0.5)',
  'rgba(255,255,0,0.45)', 'rgba(57,255,20,0.45)'
];

// ─── Control Mappings: [Left, Right, Action] per player ────────────────
const CONTROLS = [
  { left: ['KeyA', 'a'], right: ['KeyD', 'd'], action: ['Space', ' '] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], action: ['Enter'] },
  { left: ['KeyJ', 'j'], right: ['KeyL', 'l'], action: ['KeyU', 'u'] },
  { left: ['KeyF', 'f'], right: ['KeyH', 'h'], action: ['KeyY', 'y'] }
];

// ─── Table Geometry ────────────────────────────────────────────────────
const TABLE_CX = 400;
const TABLE_CY = 75;
const TABLE_RADIUS = 215;
const SEAT_RADIUS = 275;
const SHOE_X = 680;
const SHOE_Y = 20;

// ─── Menu Bar ──────────────────────────────────────────────────────────
const MENU_Y = 452;
const MENU_H = 44;
const MENU_BTN_H = 32;
const MENU_BTN_GAP = 6;

// ─── Game Config ───────────────────────────────────────────────────────
const STARTING_BALANCE = 1000;
const MIN_BET = 10;
const BET_INCREMENT = 10;
const DECK_COUNT = 6;

// ─── Timing (frames @ 60 Hz) ──────────────────────────────────────────
const DEAL_ANIM_FRAMES = 12;
const PAYOUT_DISPLAY_FRAMES = 180;
const DEALER_DELAY_FRAMES = 25;


export default class GameBlackjack {
  constructor(canvas, input, onGameOver, mods = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.onGameOver = onGameOver;
    this.mods = mods;
    this.particles = new ParticleSystem();

    this.width = 800;
    this.height = 500;
    this.playerCount = mods.playerMode || 2;
    this.paused = false;
    this.winner = null;

    // ── Shoe ──────────────────────────────────────────
    this.shoe = [];
    this.totalCardsInShoe = 0;
    this.createShoe();
    this.shuffleShoe();

    // ── Players ───────────────────────────────────────
    this.players = [];
    this.initPlayers();

    // ── Dealer ────────────────────────────────────────
    this.dealer = { hand: [], x: TABLE_CX, y: TABLE_CY - 28 };

    // ── State Machine ─────────────────────────────────
    // BETTING | DEALING | PLAYER_TURNS | DEALER_TURN | PAYOUT | ROUND_OVER | GAME_OVER
    this.phase = 'BETTING';
    this.activePlayerIndex = 0;
    this.activeHandIndex = 0;
    this.selectedMenuIndex = 0;
    this.menuOptions = [];

    // ── Dealing Animations ────────────────────────────
    this.dealQueue = [];
    this.currentDeal = null;

    // ── Dealer Turn ───────────────────────────────────
    this.dealerTimer = 0;
    this.dealerDone = false;

    // ── Payout ────────────────────────────────────────
    this.payoutTimer = 0;

    // ── Input (rising-edge detection) ─────────────────
    this.prevKeyState = {};

    // ── HUD Message ───────────────────────────────────
    this.message = '';
    this.messageTimer = 0;
    this.messageColor = '#ffffff';

    // ── Round Tracking ────────────────────────────────
    this.roundNumber = 0;

    this.buttonBounds = [];
    this.handleClick = this.handleClick.bind(this);
    this.canvas.addEventListener('click', this.handleClick);

    this.startNewRound();
  }

  cleanup() {
    this.canvas.removeEventListener('click', this.handleClick);
  }

  /* ====================================================================
     DECK MANAGEMENT
     ==================================================================== */

  createShoe() {
    this.shoe = [];
    for (let d = 0; d < DECK_COUNT; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.shoe.push({ suit, rank, faceUp: false });
        }
      }
    }
    this.totalCardsInShoe = this.shoe.length;
  }

  shuffleShoe() {
    for (let i = this.shoe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shoe[i], this.shoe[j]] = [this.shoe[j], this.shoe[i]];
    }
    this.showMessage('SHOE SHUFFLED', '#9d4edd', 90);
  }

  drawCardFromShoe(faceUp = true) {
    if (this.shoe.length <= this.totalCardsInShoe * 0.5) {
      this.createShoe();
      this.shuffleShoe();
    }
    const card = this.shoe.pop();
    card.faceUp = faceUp;
    return card;
  }

  /* ====================================================================
     HAND EVALUATION
     ==================================================================== */

  evaluateHand(cards) {
    let total = 0;
    let aces = 0;
    let faceUpCount = 0;

    for (const card of cards) {
      if (!card.faceUp) continue;
      faceUpCount++;
      total += RANK_VALUES[card.rank];
      if (card.rank === 'A') aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }

    return {
      total,
      soft: aces > 0 && total <= 21,
      bust: total > 21,
      blackjack: faceUpCount === 2 && total === 21 && cards.length === 2
    };
  }

  handTotalStr(cards) {
    const e = this.evaluateHand(cards);
    if (e.blackjack) return 'BJ';
    if (e.bust) return 'BUST';
    if (e.soft && e.total !== 21) return `${e.total - 10}/${e.total}`;
    return `${e.total}`;
  }

  /* ====================================================================
     PLAYER INITIALISATION & SEATING
     ==================================================================== */

  initPlayers() {
    this.players = [];
    for (let i = 0; i < this.playerCount; i++) {
      const angle = this.seatAngle(i, this.playerCount);
      const pos = this.seatPosition(angle);
      this.players.push({
        index: i,
        name: PLAYER_NAMES[i],
        color: PLAYER_COLORS[i],
        glow: PLAYER_GLOWS[i],
        seatAngle: angle,
        seatX: pos.x,
        seatY: pos.y,
        hands: [[]],
        bets: [MIN_BET],
        balance: STARTING_BALANCE,
        insurance: 0,
        hasBeenOfferedInsurance: false,
        handStates: ['playing'],
        active: true,
        currentBet: MIN_BET,
        balanceBeforeRound: STARTING_BALANCE,
        payoutMessage: '',
        payoutAmount: 0
      });
    }
  }

  /** Seat angle in degrees (0° right corner → 180° left corner, P1 on left). */
  seatAngle(idx, total) {
    return 180 - (180 / (total + 1)) * (idx + 1);
  }

  seatPosition(angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: TABLE_CX + SEAT_RADIUS * Math.cos(rad),
      y: TABLE_CY + SEAT_RADIUS * Math.sin(rad)
    };
  }

  firstActiveIdx() {
    for (let i = 0; i < this.players.length; i++) if (this.players[i].active) return i;
    return -1;
  }

  nextActiveIdx(from) {
    for (let i = from + 1; i < this.players.length; i++) if (this.players[i].active) return i;
    return -1;
  }

  activePlayers() { return this.players.filter(p => p.active); }
  activeCount() { return this.players.filter(p => p.active).length; }

  /* ====================================================================
     PHASE MANAGEMENT
     ==================================================================== */

  startNewRound() {
    this.roundNumber++;

    // Reset dealer
    this.dealer.hand = [];

    // Reset each player
    for (const p of this.players) {
      if (p.balance <= 0) p.active = false;
      p.hands = [[]];
      p.bets = [MIN_BET];
      p.handStates = ['playing'];
      p.insurance = 0;
      p.passedThisRound = false;
      p.hasBeenOfferedInsurance = false;
      p.currentBet = Math.min(MIN_BET, p.balance);
      p.balanceBeforeRound = p.balance;
      p.payoutMessage = '';
      p.payoutAmount = 0;
    }

    const ac = this.activeCount();
    if (ac === 0) {
      this.phase = 'GAME_OVER';
      this.showMessage('HOUSE WINS — ALL PLAYERS BANKRUPT', '#ff3333', 300);
      return;
    }
    if (ac === 1 && this.playerCount > 1) {
      const last = this.players.find(p => p.active);
      this.winner = `p${last.index + 1}`;
      const balances = this.players.map(p => `$${p.balance}`).join(' — ');
      audio.playVictory();
      this.onGameOver(this.winner, balances);
      return;
    }

    this.phase = 'BETTING';
    this.activePlayerIndex = this.firstActiveIdx();
    this.activeHandIndex = 0;
    this.selectedMenuIndex = 0;
    this.dealQueue = [];
    this.currentDeal = null;
    this.dealerTimer = 0;
    this.dealerDone = false;
    this.payoutTimer = 0;
    this.refreshMenu();
  }

  startDealingPhase() {
    this.phase = 'DEALING';
    this.refreshMenu();

    const active = this.activePlayers().filter(p => !p.passedThisRound);
    
    if (active.length === 0) {
      this.phase = 'ROUND_OVER';
      this.showMessage('ALL PLAYERS PASSED', '#ffffff', 90);
      this.refreshMenu();
      return;
    }

    // Round 1: one card to each player face-up
    for (const p of active) this.dealQueue.push({ target: 'player', playerIndex: p.index, handIndex: 0, faceUp: true });
    this.dealQueue.push({ target: 'dealer', faceUp: true });
    // Round 2: second card to each player face-up, dealer gets hole card face-down
    for (const p of active) this.dealQueue.push({ target: 'player', playerIndex: p.index, handIndex: 0, faceUp: true });
    this.dealQueue.push({ target: 'dealer', faceUp: false });
  }

  startPlayerTurns() {
    this.phase = 'PLAYER_TURNS';
    this.activePlayerIndex = this.firstActiveIdx();
    this.activeHandIndex = 0;
    this.selectedMenuIndex = 0;

    // Mark immediate blackjacks
    for (const p of this.players) {
      if (!p.active) continue;
      if (this.evaluateHand(p.hands[0]).blackjack) p.handStates[0] = 'blackjack';
    }
    this.skipToNextPlayable();
    this.refreshMenu();
  }

  /**
   * Advances through completed hands / players until we find
   * one that is still 'playing', or triggers the dealer turn.
   */
  skipToNextPlayable() {
    while (this.activePlayerIndex >= 0 && this.activePlayerIndex < this.players.length) {
      const p = this.players[this.activePlayerIndex];
      if (p.active && !p.passedThisRound && p.handStates[this.activeHandIndex] === 'playing') return; // found one
      // Try next hand
      if (this.activeHandIndex + 1 < p.hands.length) { this.activeHandIndex++; continue; }
      // Try next player
      const n = this.nextActiveIdx(this.activePlayerIndex);
      if (n === -1) { this.startDealerTurn(); return; }
      this.activePlayerIndex = n;
      this.activeHandIndex = 0;
    }
    this.startDealerTurn();
  }

  startDealerTurn() {
    this.phase = 'DEALER_TURN';
    this.refreshMenu();
    this.dealerTimer = DEALER_DELAY_FRAMES;
    this.dealerDone = false;

    // Flip hole card
    if (this.dealer.hand.length >= 2 && !this.dealer.hand[1].faceUp) {
      this.dealer.hand[1].faceUp = true;
      audio.playBounce();
    }

    // If every playing player busted or got blackjack, dealer doesn't play
    const allSettled = this.players.every(p => {
      if (!p.active || p.passedThisRound) return true;
      return p.handStates.every(s => s === 'bust' || s === 'blackjack');
    });
    if (allSettled) { this.dealerDone = true; this.dealerTimer = DEALER_DELAY_FRAMES; }
  }

  processDealerTurn() {
    if (this.dealerDone) {
      this.dealerTimer--;
      if (this.dealerTimer <= 0) this.startPayout();
      return;
    }
    if (this.currentDeal) return; // wait for animation
    this.dealerTimer--;
    if (this.dealerTimer > 0) return;

    const e = this.evaluateHand(this.dealer.hand);
    if (e.total >= 17) {
      this.dealerDone = true;
      this.dealerTimer = DEALER_DELAY_FRAMES;
      return;
    }
    // Dealer hits
    this.dealQueue.push({ target: 'dealer', faceUp: true });
    this.dealerTimer = DEALER_DELAY_FRAMES;
  }

  startPayout() {
    this.phase = 'PAYOUT';
    this.payoutTimer = PAYOUT_DISPLAY_FRAMES;
    this.refreshMenu();

    const de = this.evaluateHand(this.dealer.hand);

    for (const p of this.players) {
      if (!p.active || p.passedThisRound) continue;
      let totalReturn = 0;
      const msgs = [];

      for (let h = 0; h < p.hands.length; h++) {
        const he = this.evaluateHand(p.hands[h]);
        const bet = p.bets[h];
        let ret = 0; // Amount returned to player (includes original bet on win)

        if (p.handStates[h] === 'bust') {
          ret = 0;
          msgs.push('BUST');
        } else if (p.handStates[h] === 'blackjack') {
          if (de.blackjack) {
            ret = bet; // Push
            msgs.push('PUSH');
          } else {
            ret = bet + Math.floor(bet * 1.5); // 3:2
            msgs.push('BLACKJACK!');
          }
        } else if (de.bust) {
          ret = bet * 2;
          msgs.push('WIN');
        } else if (he.total > de.total) {
          ret = bet * 2;
          msgs.push('WIN');
        } else if (he.total === de.total) {
          ret = bet;
          msgs.push('PUSH');
        } else {
          ret = 0;
          msgs.push('LOSE');
        }
        totalReturn += ret;
      }

      // Insurance resolution
      if (p.insurance > 0) {
        if (de.blackjack) {
          totalReturn += p.insurance * 3; // 2:1 plus original back
          msgs.push('INS ✓');
        } else {
          msgs.push('INS ✗');
        }
      }

      p.balance += totalReturn;
      p.payoutAmount = p.balance - p.balanceBeforeRound;
      p.payoutMessage = msgs.join(' | ');

      if (p.payoutAmount > 0) {
        this.particles.spawnExplosion(p.seatX, p.seatY - 30, p.color, 20, 0.8);
        audio.playScore();
      } else if (p.payoutAmount < 0) {
        this.particles.spawnExplosion(p.seatX, p.seatY - 30, '#ff3333', 12, 0.5);
      }
    }
  }

  /* ====================================================================
     PLAYER ACTIONS
     ==================================================================== */

  canHit() {
    if (this.phase !== 'PLAYER_TURNS') return false;
    const p = this.players[this.activePlayerIndex];
    return p && p.active && p.handStates[this.activeHandIndex] === 'playing';
  }
  canStand() { return this.canHit(); }

  canDouble() {
    if (!this.canHit()) return false;
    const p = this.players[this.activePlayerIndex];
    return p.hands[this.activeHandIndex].length === 2 && p.balance >= p.bets[this.activeHandIndex];
  }

  canSplit() {
    if (!this.canHit()) return false;
    const p = this.players[this.activePlayerIndex];
    const hand = p.hands[this.activeHandIndex];
    if (hand.length !== 2 || p.hands.length >= 2) return false;
    const v1 = Math.min(RANK_VALUES[hand[0].rank], 10);
    const v2 = Math.min(RANK_VALUES[hand[1].rank], 10);
    // Allow split on same-value (Aces count as same)
    if (hand[0].rank === 'A' && hand[1].rank === 'A') return p.balance >= p.bets[this.activeHandIndex];
    return v1 === v2 && p.balance >= p.bets[this.activeHandIndex];
  }

  canInsurance() {
    if (!this.canHit()) return false;
    const p = this.players[this.activePlayerIndex];
    if (p.hasBeenOfferedInsurance || this.activeHandIndex !== 0) return false;
    if (p.hands[0].length !== 2) return false;
    if (this.dealer.hand.length === 0 || this.dealer.hand[0].rank !== 'A') return false;
    return p.balance >= Math.floor(p.bets[0] / 2);
  }

  canDecreaseBet() {
    const p = this.players[this.activePlayerIndex];
    return this.phase === 'BETTING' && p && p.active && p.currentBet > MIN_BET;
  }
  canIncreaseBet() {
    const p = this.players[this.activePlayerIndex];
    return this.phase === 'BETTING' && p && p.active && p.currentBet + BET_INCREMENT <= p.balance;
  }

  performAction(action) {
    if (this.currentDeal) return;
    switch (action) {
      case 'bet_decrease': this.adjustBet(-BET_INCREMENT); break;
      case 'bet_increase': this.adjustBet(BET_INCREMENT); break;
      case 'confirm_bet': this.confirmBet(); break;
      case 'pass': this.actionPass(); break;
      case 'hit': this.actionHit(); break;
      case 'stand': this.actionStand(); break;
      case 'double': this.actionDouble(); break;
      case 'split': this.actionSplit(); break;
      case 'insurance': this.actionInsurance(); break;
      case 'new_round': this.startNewRound(); break;
    }
  }

  adjustBet(amount) {
    const p = this.players[this.activePlayerIndex];
    if (!p || !p.active) return;
    p.currentBet = Math.max(MIN_BET, Math.min(p.balance, p.currentBet + amount));
    audio.playMenuTick();
  }

  confirmBet() {
    const p = this.players[this.activePlayerIndex];
    if (!p || !p.active) return;
    p.bets[0] = p.currentBet;
    p.balance -= p.currentBet;
    audio.playMenuSelect();

    const next = this.nextActiveIdx(this.activePlayerIndex);
    if (next === -1) {
      this.startDealingPhase();
    } else {
      this.activePlayerIndex = next;
      this.selectedMenuIndex = 0;
      this.refreshMenu();
    }
  }

  actionPass() {
    const p = this.players[this.activePlayerIndex];
    if (!p || !p.active) return;
    p.passedThisRound = true;
    p.bets[0] = 0;
    p.handStates[0] = 'stand';
    audio.playMenuSelect();

    const next = this.nextActiveIdx(this.activePlayerIndex);
    if (next === -1) {
      this.startDealingPhase();
    } else {
      this.activePlayerIndex = next;
      this.selectedMenuIndex = 0;
      this.refreshMenu();
    }
  }

  actionHit() {
    if (!this.canHit()) return;
    this.players[this.activePlayerIndex].hasBeenOfferedInsurance = true;
    audio.playBounce();
    this.dealQueue.push({
      target: 'player', playerIndex: this.activePlayerIndex,
      handIndex: this.activeHandIndex, faceUp: true
    });
  }

  actionStand() {
    if (!this.canStand()) return;
    const p = this.players[this.activePlayerIndex];
    p.hasBeenOfferedInsurance = true;
    p.handStates[this.activeHandIndex] = 'stand';
    audio.playBounce();
    this.advanceHand();
  }

  actionDouble() {
    if (!this.canDouble()) return;
    const p = this.players[this.activePlayerIndex];
    p.hasBeenOfferedInsurance = true;
    const extra = p.bets[this.activeHandIndex];
    p.balance -= extra;
    p.bets[this.activeHandIndex] *= 2;
    audio.playMenuSelect();
    this.dealQueue.push({
      target: 'player', playerIndex: this.activePlayerIndex,
      handIndex: this.activeHandIndex, faceUp: true, autoStand: true
    });
  }

  actionSplit() {
    if (!this.canSplit()) return;
    const p = this.players[this.activePlayerIndex];
    p.hasBeenOfferedInsurance = true;
    const hand = p.hands[this.activeHandIndex];
    const second = hand.pop();
    p.hands.push([second]);
    p.handStates.push('playing');
    const bet = p.bets[this.activeHandIndex];
    p.balance -= bet;
    p.bets.push(bet);
    audio.playPowerup();

    const isAces = hand[0].rank === 'A';
    this.dealQueue.push({
      target: 'player', playerIndex: this.activePlayerIndex,
      handIndex: 0, faceUp: true, autoStand: isAces
    });
    this.dealQueue.push({
      target: 'player', playerIndex: this.activePlayerIndex,
      handIndex: 1, faceUp: true, autoStand: isAces
    });
    this.refreshMenu();
  }

  actionInsurance() {
    if (!this.canInsurance()) return;
    const p = this.players[this.activePlayerIndex];
    const ins = Math.floor(p.bets[0] / 2);
    p.insurance = ins;
    p.balance -= ins;
    p.hasBeenOfferedInsurance = true;
    audio.playMenuSelect();
    this.showMessage(`${p.name} INSURES: $${ins}`, p.color, 60);
    this.refreshMenu();
  }

  advanceHand() {
    const p = this.players[this.activePlayerIndex];
    // Next hand of same player
    if (this.activeHandIndex + 1 < p.hands.length && p.handStates[this.activeHandIndex + 1] === 'playing') {
      this.activeHandIndex++;
      this.selectedMenuIndex = 0;
      this.refreshMenu();
      return;
    }
    // Next player
    const next = this.nextActiveIdx(this.activePlayerIndex);
    if (next === -1) { this.startDealerTurn(); return; }
    this.activePlayerIndex = next;
    this.activeHandIndex = 0;
    this.skipToNextPlayable();
    this.selectedMenuIndex = 0;
    this.refreshMenu();
  }

  /* ====================================================================
     DEALING ANIMATION QUEUE
     ==================================================================== */

  processDealQueue() {
    if (this.currentDeal) {
      this.currentDeal.frame++;
      this.currentDeal.progress = this.currentDeal.frame / this.currentDeal.duration;
      if (this.currentDeal.progress >= 1) {
        this.completeDeal(this.currentDeal);
        this.currentDeal = null;
      }
      return;
    }
    if (this.dealQueue.length > 0) {
      const info = this.dealQueue.shift();
      const card = this.drawCardFromShoe(info.faceUp);
      let toX, toY;

      if (info.target === 'dealer') {
        const n = this.dealer.hand.length;
        toX = this.dealer.x - ((n * CARD_OVERLAP + CARD_W) / 2) + n * CARD_OVERLAP;
        toY = this.dealer.y;
      } else {
        const p = this.players[info.playerIndex];
        const hand = p.hands[info.handIndex];
        const hOff = info.handIndex * (CARD_W * 2 + 8) - (p.hands.length - 1) * (CARD_W + 4);
        toX = p.seatX + hOff - ((hand.length * CARD_OVERLAP + CARD_W) / 2) + hand.length * CARD_OVERLAP;
        toY = p.seatY - CARD_H - 18;
      }

      this.currentDeal = {
        ...info, card,
        fromX: SHOE_X, fromY: SHOE_Y,
        toX, toY,
        frame: 0, duration: DEAL_ANIM_FRAMES, progress: 0
      };
      audio.playBounce();
    } else if (this.phase === 'DEALING') {
      this.startPlayerTurns();
    }
  }

  completeDeal(deal) {
    if (deal.target === 'dealer') {
      this.dealer.hand.push(deal.card);
    } else {
      const p = this.players[deal.playerIndex];
      p.hands[deal.handIndex].push(deal.card);
      const e = this.evaluateHand(p.hands[deal.handIndex]);

      if (e.bust) {
        p.handStates[deal.handIndex] = 'bust';
        this.particles.spawnExplosion(p.seatX, p.seatY - 40, '#ff3333', 25, 1.0);
        triggerScreenShake();
        this.showMessage(`${p.name} BUSTS!`, '#ff3333', 60);
        if (this.phase === 'PLAYER_TURNS') { this.advanceHand(); return; }
      }

      if (e.blackjack && p.hands[deal.handIndex].length === 2) {
        p.handStates[deal.handIndex] = 'blackjack';
        this.particles.spawnExplosion(p.seatX, p.seatY - 40, '#ffaa00', 30, 1.2);
        this.showMessage(`${p.name} BLACKJACK!`, '#ffaa00', 60);
        audio.playPowerup();
        if (this.phase === 'PLAYER_TURNS') { this.advanceHand(); return; }
      }

      if (deal.autoStand && this.phase === 'PLAYER_TURNS') {
        p.handStates[deal.handIndex] = 'stand';
        this.advanceHand();
        return;
      }
    }
    if (this.phase === 'PLAYER_TURNS') this.refreshMenu();
  }

  /* ====================================================================
     MENU SYSTEM
     ==================================================================== */

  refreshMenu() {
    switch (this.phase) {
      case 'BETTING':
        this.menuOptions = [
          { label: '◀ -$10', action: 'bet_decrease', enabled: this.canDecreaseBet() },
          { label: '+$10 ▶', action: 'bet_increase', enabled: this.canIncreaseBet() },
          { label: '✓ DEAL', action: 'confirm_bet', enabled: true },
          { label: 'PASS', action: 'pass', enabled: true }
        ];
        break;
      case 'PLAYER_TURNS':
        this.menuOptions = [
          { label: 'HIT', action: 'hit', enabled: this.canHit() },
          { label: 'STAND', action: 'stand', enabled: this.canStand() },
          { label: 'DOUBLE', action: 'double', enabled: this.canDouble() },
          { label: 'SPLIT', action: 'split', enabled: this.canSplit() },
          { label: 'INSURE', action: 'insurance', enabled: this.canInsurance() }
        ];
        break;
      case 'ROUND_OVER':
        this.menuOptions = [
          { label: '▶ NEW ROUND', action: 'new_round', enabled: this.activeCount() > 0 }
        ];
        break;
      default:
        this.menuOptions = [];
    }
    if (this.selectedMenuIndex >= this.menuOptions.length) this.selectedMenuIndex = 0;
  }

  /* ====================================================================
     INPUT
     ==================================================================== */

  handleClick(e) {
    if (this.paused || this.winner || this.currentDeal) return;
    if (['DEALING', 'DEALER_TURN', 'PAYOUT', 'GAME_OVER'].includes(this.phase)) return;

    // Get click coords relative to canvas
    const rect = this.canvas.getBoundingClientRect();
    
    // Accommodate CSS object-fit: contain letterboxing
    const ratioCanvas = this.canvas.width / this.canvas.height;
    const ratioRect = rect.width / rect.height;

    let drawW, drawH, drawX, drawY;
    if (ratioCanvas > ratioRect) {
      drawW = rect.width;
      drawH = rect.width / ratioCanvas;
      drawX = 0;
      drawY = (rect.height - drawH) / 2;
    } else {
      drawH = rect.height;
      drawW = rect.height * ratioCanvas;
      drawX = (rect.width - drawW) / 2;
      drawY = 0;
    }

    const scaleX = this.width / drawW;
    const scaleY = this.height / drawH;
    const clickX = (e.clientX - rect.left - drawX) * scaleX;
    const clickY = (e.clientY - rect.top - drawY) * scaleY;

    // Check bounds
    for (const btn of this.buttonBounds) {
      if (clickX >= btn.x && clickX <= btn.x + btn.w &&
          clickY >= btn.y && clickY <= btn.y + btn.h) {
        if (btn.enabled) {
          if (this.phase === 'ROUND_OVER') {
            this.performAction(btn.action);
            return;
          }
          this.selectedMenuIndex = btn.index;
          this.performAction(btn.action);
          this.refreshMenu();
        }
        break;
      }
    }
  }

  justPressed(keyOrCode) {
    return this.input.isPressed(keyOrCode) && !this.prevKeyState[keyOrCode];
  }

  captureKeys() {
    const all = [];
    for (const c of CONTROLS) all.push(...c.left, ...c.right, ...c.action);
    for (const k of all) this.prevKeyState[k] = this.input.isPressed(k);
  }

  handleInput() {
    // Keyboard input disabled - all actions must be performed via mouse click
    return;
  }

  /* ====================================================================
     MESSAGE HELPER
     ==================================================================== */

  showMessage(text, color = '#ffffff', dur = 90) {
    this.message = text;
    this.messageColor = color;
    this.messageTimer = dur;
  }

  /* ====================================================================
     TICK (called each frame by the engine loop)
     ==================================================================== */

  tick() {
    if (this.paused || this.winner) return;

    this.handleInput();
    this.captureKeys();
    this.processDealQueue();

    if (this.phase === 'DEALER_TURN') this.processDealerTurn();

    if (this.phase === 'PAYOUT') {
      this.payoutTimer--;
      if (this.payoutTimer <= 0) {
        this.phase = 'ROUND_OVER';
        this.selectedMenuIndex = 0;
        this.refreshMenu();
      }
    }

    if (this.messageTimer > 0) this.messageTimer--;
    this.particles.update();
  }

  /* ====================================================================
     RENDERING
     ==================================================================== */

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackground(ctx);
    this.drawTable(ctx);
    this.drawShoe(ctx);
    this.drawDealerArea(ctx);

    for (let i = 0; i < this.players.length; i++) this.drawPlayerArea(ctx, this.players[i], i);

    if (this.currentDeal) this.drawAnimatingCard(ctx);

    this.drawMenuBar(ctx);
    this.drawPhaseInfo(ctx);
    if (this.messageTimer > 0) this.drawMessageOverlay(ctx);

    this.particles.draw(ctx);
  }

  /* ─── Background ───────────────────────────────────────────────────── */
  drawBackground(ctx) {
    const g = ctx.createRadialGradient(400, 250, 50, 400, 250, 500);
    g.addColorStop(0, '#0d0f1a');
    g.addColorStop(1, '#04020a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.strokeStyle = 'rgba(157,78,221,0.04)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < this.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke(); }
    for (let y = 0; y < this.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke(); }
  }

  /* ─── Table ────────────────────────────────────────────────────────── */
  drawTable(ctx) {
    ctx.save();
    // Semicircle felt
    ctx.beginPath();
    ctx.arc(TABLE_CX, TABLE_CY, TABLE_RADIUS, 0, Math.PI, false);
    ctx.closePath();
    const tg = ctx.createRadialGradient(TABLE_CX, TABLE_CY + 50, 20, TABLE_CX, TABLE_CY + 50, TABLE_RADIUS);
    tg.addColorStop(0, '#0f2e2a');
    tg.addColorStop(0.6, '#0a2420');
    tg.addColorStop(1, '#061816');
    ctx.fillStyle = tg;
    ctx.fill();

    // Outer glow border
    ctx.shadowColor = '#9d4edd';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#9d4edd';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner trim
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(TABLE_CX, TABLE_CY, TABLE_RADIUS - 8, 0, Math.PI, false);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(157,78,221,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Diameter line
    ctx.beginPath();
    ctx.moveTo(TABLE_CX - TABLE_RADIUS, TABLE_CY);
    ctx.lineTo(TABLE_CX + TABLE_RADIUS, TABLE_CY);
    ctx.shadowColor = '#9d4edd';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#9d4edd';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Table text
    ctx.font = '10px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(157,78,221,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BLACKJACK PAYS 3 TO 2', TABLE_CX, TABLE_CY + 55);
    ctx.font = '8px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(157,78,221,0.25)';
    ctx.fillText('DEALER STANDS ON ALL 17s', TABLE_CX, TABLE_CY + 70);

    // Seat dots on arc
    for (const p of this.players) {
      const rad = (p.seatAngle * Math.PI) / 180;
      const mx = TABLE_CX + (TABLE_RADIUS + 5) * Math.cos(rad);
      const my = TABLE_CY + (TABLE_RADIUS + 5) * Math.sin(rad);
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.active ? p.color : 'rgba(80,80,80,0.3)';
      ctx.fill();
      if (p.active) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }

  /* ─── Shoe Indicator ───────────────────────────────────────────────── */
  drawShoe(ctx) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i === 3 ? '#1a1040' : '#12082a';
      ctx.strokeStyle = '#4a4070';
      ctx.lineWidth = 1;
      this.roundedRect(ctx, SHOE_X - i, SHOE_Y - i, CARD_W, CARD_H, 3, true, true);
    }
    ctx.font = '9px Orbitron, sans-serif';
    ctx.fillStyle = '#8b88a1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${this.shoe.length}`, SHOE_X + CARD_W / 2, SHOE_Y + CARD_H + 3);
    ctx.restore();
  }

  /* ─── Dealer Area ──────────────────────────────────────────────────── */
  drawDealerArea(ctx) {
    ctx.save();
    // Label
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillStyle = '#9d4edd';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = '#9d4edd';
    ctx.shadowBlur = 8;
    ctx.fillText('DEALER', this.dealer.x, this.dealer.y - 4);
    ctx.shadowBlur = 0;

    // Cards
    const hand = this.dealer.hand;
    const startX = this.dealer.x - ((Math.max(hand.length - 1, 0) * CARD_OVERLAP + CARD_W) / 2);
    for (let i = 0; i < hand.length; i++) {
      this.drawCard(ctx, startX + i * CARD_OVERLAP, this.dealer.y, hand[i]);
    }

    // Total
    if (hand.some(c => c.faceUp)) {
      const e = this.evaluateHand(hand);
      const ts = this.handTotalStr(hand);
      const tx = this.dealer.x;
      const ty = this.dealer.y + CARD_H + 4;
      ctx.font = 'bold 12px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const tw = ctx.measureText(ts).width + 14;
      ctx.fillStyle = e.bust ? 'rgba(255,51,51,0.3)' : 'rgba(157,78,221,0.2)';
      this.roundedRect(ctx, tx - tw / 2, ty - 2, tw, 18, 9, true, false);
      ctx.fillStyle = e.bust ? '#ff3333' : '#e0c0ff';
      ctx.fillText(ts, tx, ty);
    }
    ctx.restore();
  }

  /* ─── Player Area ──────────────────────────────────────────────────── */
  drawPlayerArea(ctx, player, idx) {
    ctx.save();
    const isActive = this.phase === 'PLAYER_TURNS' && idx === this.activePlayerIndex;
    const isBetting = this.phase === 'BETTING' && idx === this.activePlayerIndex;
    const alpha = player.active ? 1.0 : 0.25;
    ctx.globalAlpha = alpha;

    // Active player ring
    if (!player.passedThisRound && (isActive || isBetting)) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
      ctx.beginPath();
      ctx.arc(player.seatX, player.seatY + 5, 60, 0, Math.PI * 2);
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha * (0.2 + 0.35 * pulse);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }

    // Name
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = player.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (!player.passedThisRound && (isActive || isBetting)) { ctx.shadowColor = player.color; ctx.shadowBlur = 10; }
    ctx.fillText(player.name, player.seatX, player.seatY + 4);
    ctx.shadowBlur = 0;

    // Hands
    for (let h = 0; h < player.hands.length; h++) {
      const hand = player.hands[h];
      const numHands = player.hands.length;
      // Offset each hand when split
      const hOff = numHands > 1 ? (h - (numHands - 1) / 2) * (CARD_W + 25) : 0;
      const baseX = player.seatX + hOff;
      const baseY = player.seatY - CARD_H - 22;

      // Dynamic overlap
      const overlap = hand.length > 1 ? Math.min(CARD_OVERLAP, (MAX_HAND_WIDTH - CARD_W) / (hand.length - 1)) : 0;
      const handW = hand.length > 0 ? (hand.length - 1) * overlap + CARD_W : 0;
      const sx = baseX - handW / 2;

      for (let c = 0; c < hand.length; c++) {
        this.drawCard(ctx, sx + c * overlap, baseY, hand[c]);
      }

      // Total badge
      if (hand.length > 0) {
        const e = this.evaluateHand(hand);
        const ts = this.handTotalStr(hand);
        const isCurrentHand = isActive && h === this.activeHandIndex;

        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const ty = baseY + CARD_H + 2;
        const tw = ctx.measureText(ts).width + 12;

        let pillFill = 'rgba(255,255,255,0.08)';
        if (e.bust) pillFill = 'rgba(255,51,51,0.3)';
        else if (e.blackjack) pillFill = 'rgba(255,170,0,0.3)';
        else if (isCurrentHand) pillFill = this.hexToRgba(player.color, 0.2);

        ctx.fillStyle = pillFill;
        this.roundedRect(ctx, baseX - tw / 2, ty - 1, tw, 16, 8, true, false);
        ctx.fillStyle = e.bust ? '#ff3333' : (e.blackjack ? '#ffaa00' : '#f0edf8');
        ctx.fillText(ts, baseX, ty);

        // State label (for completed hands)
        const hs = player.handStates[h];
        if (hs && hs !== 'playing') {
          ctx.font = '7px Orbitron, sans-serif';
          ctx.fillStyle = hs === 'bust' ? '#ff3333' : hs === 'blackjack' ? '#ffaa00' : '#8b88a1';
          ctx.fillText(hs.toUpperCase(), baseX, ty + 17);
        }

        // Active hand pointer
        if (isCurrentHand && numHands > 1) {
          ctx.fillStyle = player.color;
          ctx.font = '10px sans-serif';
          ctx.fillText('▼', baseX, baseY - 10);
        }
      }
    }

    // Bet / Passed Status
    if (player.passedThisRound) {
      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.fillStyle = '#8b88a1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('PASSED', player.seatX, player.seatY + 22);
    } else {
      const betTotal = player.bets.reduce((a, b) => a + b, 0);
      const displayBet = isBetting ? player.currentBet : betTotal;
      if (displayBet > 0 || this.phase === 'BETTING') {
        const betStr = `$${displayBet}`;
        ctx.font = 'bold 10px Orbitron, sans-serif';
        const textW = ctx.measureText(betStr).width;
        
        // Chip diameter is 14 (radius 7). Gap is 4. Total width = 14 + 4 + textW.
        const totalW = 14 + 4 + textW;
        const startX = player.seatX - totalW / 2;
        
        const betY = player.seatY + 20;

        // Chip
        ctx.beginPath();
        ctx.arc(startX + 7, betY + 5, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,170,0,0.15)';
        ctx.fill();
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ffaa00';
        ctx.fillText(betStr, startX + 18, betY);
      }
    }

    // Balance
    ctx.font = '9px Orbitron, sans-serif';
    ctx.fillStyle = player.balance > 0 ? '#8b88a1' : '#ff3333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`BAL: $${player.balance}`, player.seatX, player.seatY + 38);

    // Insurance
    if (player.insurance > 0) {
      ctx.font = '8px Orbitron, sans-serif';
      ctx.fillStyle = '#9d4edd';
      ctx.fillText(`INS: $${player.insurance}`, player.seatX, player.seatY + 48);
    }

    // Payout
    if ((this.phase === 'PAYOUT' || this.phase === 'ROUND_OVER') && player.payoutMessage) {
      const pc = player.payoutAmount > 0 ? '#39ff14' : player.payoutAmount < 0 ? '#ff3333' : '#ffaa00';
      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = pc;
      ctx.shadowColor = pc;
      ctx.shadowBlur = 8;
      const sign = player.payoutAmount > 0 ? '+' : '';
      ctx.fillText(`${player.payoutMessage} (${sign}$${player.payoutAmount})`, player.seatX, player.seatY - CARD_H - 26);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  /* ─── Playing Card ─────────────────────────────────────────────────── */
  drawCard(ctx, x, y, card) {
    ctx.save();
    if (card.faceUp) {
      ctx.fillStyle = '#0d0b1a';
      this.roundedRect(ctx, x, y, CARD_W, CARD_H, 4, true, false);
      const sc = SUIT_COLORS[card.suit];
      ctx.strokeStyle = sc;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = sc;
      ctx.shadowBlur = 4;
      this.roundedRect(ctx, x, y, CARD_W, CARD_H, 4, false, true);
      ctx.shadowBlur = 0;

      ctx.fillStyle = sc;
      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(card.rank, x + 3, y + 3);
      ctx.font = '10px serif';
      ctx.fillText(SUIT_SYMBOLS[card.suit], x + 4, y + 16);

      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(SUIT_SYMBOLS[card.suit], x + CARD_W / 2, y + CARD_H / 2 + 2);

      ctx.save();
      ctx.translate(x + CARD_W - 3, y + CARD_H - 3);
      ctx.rotate(Math.PI);
      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(card.rank, 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1a1040';
      this.roundedRect(ctx, x, y, CARD_W, CARD_H, 4, true, false);
      ctx.strokeStyle = '#4a3a80';
      ctx.lineWidth = 1.2;
      this.roundedRect(ctx, x, y, CARD_W, CARD_H, 4, false, true);

      // Diamond cross-hatch pattern
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 4, y + 4, CARD_W - 8, CARD_H - 8);
      ctx.clip();
      ctx.strokeStyle = 'rgba(157,78,221,0.12)';
      ctx.lineWidth = 0.5;
      for (let dy = -CARD_H; dy < CARD_H * 2; dy += 8) {
        ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.lineTo(x + CARD_W, y + dy + CARD_W); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + CARD_W, y + dy); ctx.lineTo(x, y + dy + CARD_W); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(157,78,221,0.25)';
      ctx.lineWidth = 0.8;
      this.roundedRect(ctx, x + 4, y + 4, CARD_W - 8, CARD_H - 8, 2, false, true);
    }
    ctx.restore();
  }

  /* ─── Animating Card ───────────────────────────────────────────────── */
  drawAnimatingCard(ctx) {
    if (!this.currentDeal) return;
    const d = this.currentDeal;
    const t = this.easeOutCubic(d.progress);
    const x = d.fromX + (d.toX - d.fromX) * t;
    const y = d.fromY + (d.toY - d.fromY) * t;
    this.drawCard(ctx, x, y, d.card);
  }

  /* ─── Menu Bar ─────────────────────────────────────────────────────── */
  drawMenuBar(ctx) {
    ctx.save();
    // Background
    ctx.fillStyle = 'rgba(13,11,26,0.92)';
    ctx.fillRect(0, MENU_Y, this.width, MENU_H);
    ctx.strokeStyle = 'rgba(157,78,221,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, MENU_Y); ctx.lineTo(this.width, MENU_Y); ctx.stroke();

    if (this.menuOptions.length === 0) {
      ctx.font = '12px Orbitron, sans-serif';
      ctx.fillStyle = '#8b88a1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const txt = this.phase === 'DEALING' ? 'DEALING CARDS...' :
                  this.phase === 'DEALER_TURN' ? "DEALER'S TURN..." :
                  this.phase === 'PAYOUT' ? 'CALCULATING PAYOUTS...' :
                  this.phase === 'GAME_OVER' ? 'GAME OVER' : '';
      ctx.fillText(txt, this.width / 2, MENU_Y + MENU_H / 2);
      ctx.restore();
      return;
    }

    const ac = this.activePlayerIndex >= 0 && this.activePlayerIndex < PLAYER_COLORS.length ?
               PLAYER_COLORS[this.activePlayerIndex] : '#ffffff';

    // Player tag
    if (this.phase !== 'ROUND_OVER') {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = ac;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = ac;
      ctx.shadowBlur = 6;
      ctx.fillText(`P${this.activePlayerIndex + 1}`, 12, MENU_Y + MENU_H / 2);
      ctx.shadowBlur = 0;
    }

    // Bet display during betting
    if (this.phase === 'BETTING' && this.activePlayerIndex >= 0) {
      const p = this.players[this.activePlayerIndex];
      if (p) {
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.fillStyle = '#ffaa00';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`BET: $${p.currentBet}`, 58, MENU_Y + MENU_H / 2);
      }
    }

    // Hand indicator
    if (this.phase === 'PLAYER_TURNS' && this.activePlayerIndex >= 0) {
      const p = this.players[this.activePlayerIndex];
      if (p && p.hands.length > 1) {
        ctx.font = '9px Orbitron, sans-serif';
        ctx.fillStyle = '#8b88a1';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`HAND ${this.activeHandIndex + 1}/${p.hands.length}`, 58, MENU_Y + MENU_H / 2);
      }
    }

    // Buttons
    ctx.font = 'bold 10px Orbitron, sans-serif';
    const btnWidths = this.menuOptions.map(o => Math.max(ctx.measureText(o.label).width + 22, 68));
    const totalW = btnWidths.reduce((s, w) => s + w + MENU_BTN_GAP, -MENU_BTN_GAP);
    let bx = Math.max((this.width - totalW) / 2, this.phase === 'BETTING' ? 165 : 100);
    const by = MENU_Y + (MENU_H - MENU_BTN_H) / 2;

    this.buttonBounds = [];

    for (let i = 0; i < this.menuOptions.length; i++) {
      const opt = this.menuOptions[i];
      const bw = btnWidths[i];
      const sel = i === this.selectedMenuIndex;

      if (opt.enabled) {
        ctx.fillStyle = 'rgba(27,23,48,0.55)';
        this.roundedRect(ctx, bx, by, bw, MENU_BTN_H, 5, true, false);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        this.roundedRect(ctx, bx, by, bw, MENU_BTN_H, 5, false, true);
      } else {
        ctx.fillStyle = 'rgba(20,18,30,0.45)';
        this.roundedRect(ctx, bx, by, bw, MENU_BTN_H, 5, true, false);
        ctx.strokeStyle = 'rgba(80,80,80,0.12)';
        ctx.lineWidth = 1;
        this.roundedRect(ctx, bx, by, bw, MENU_BTN_H, 5, false, true);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = opt.enabled ? '#8b88a1' : 'rgba(80,80,80,0.35)';
      ctx.fillText(opt.label, bx + bw / 2, by + MENU_BTN_H / 2);

      this.buttonBounds.push({
        x: bx, y: by, w: bw, h: MENU_BTN_H,
        action: opt.action, enabled: opt.enabled,
        index: i
      });

      bx += bw + MENU_BTN_GAP;
    }

    // Control hints (Keyboard inputs disabled per request)
    ctx.restore();
  }

  /* ─── Phase Info ───────────────────────────────────────────────────── */
  drawPhaseInfo(ctx) {
    ctx.save();
    ctx.font = '9px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(139,136,161,0.45)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`ROUND ${this.roundNumber}`, 10, 8);
    ctx.restore();
  }

  /* ─── Message Overlay ──────────────────────────────────────────────── */
  drawMessageOverlay(ctx) {
    ctx.save();
    const a = Math.min(1, this.messageTimer / 30);
    ctx.globalAlpha = a;
    ctx.font = 'bold 16px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.messageColor;
    ctx.shadowColor = this.messageColor;
    ctx.shadowBlur = 15;
    ctx.fillText(this.message, this.width / 2, this.height / 2 - 20);
    ctx.restore();
  }

  /* ====================================================================
     UTILITIES
     ==================================================================== */

  roundedRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /* ====================================================================
     NETWORK STATE (for netplay compatibility)
     ==================================================================== */

  getState() {
    return {
      phase: this.phase,
      activePlayerIndex: this.activePlayerIndex,
      activeHandIndex: this.activeHandIndex,
      selectedMenuIndex: this.selectedMenuIndex,
      roundNumber: this.roundNumber,
      dealer: {
        hand: this.dealer.hand.map(c => ({ suit: c.suit, rank: c.rank, faceUp: c.faceUp }))
      },
      players: this.players.map(p => ({
        hands: p.hands.map(h => h.map(c => ({ suit: c.suit, rank: c.rank, faceUp: c.faceUp }))),
        bets: [...p.bets],
        balance: p.balance,
        insurance: p.insurance,
        hasBeenOfferedInsurance: p.hasBeenOfferedInsurance,
        handStates: [...p.handStates],
        active: p.active,
        currentBet: p.currentBet,
        balanceBeforeRound: p.balanceBeforeRound,
        payoutMessage: p.payoutMessage,
        payoutAmount: p.payoutAmount
      })),
      message: this.message,
      messageTimer: this.messageTimer,
      messageColor: this.messageColor
    };
  }

  applyNetworkState(state) {
    this.phase = state.phase;
    this.activePlayerIndex = state.activePlayerIndex;
    this.activeHandIndex = state.activeHandIndex;
    this.selectedMenuIndex = state.selectedMenuIndex;
    this.roundNumber = state.roundNumber;

    this.dealer.hand = state.dealer.hand.map(c => ({ suit: c.suit, rank: c.rank, faceUp: c.faceUp }));

    for (let i = 0; i < state.players.length && i < this.players.length; i++) {
      const sp = state.players[i];
      this.players[i].hands = sp.hands.map(h => h.map(c => ({ suit: c.suit, rank: c.rank, faceUp: c.faceUp })));
      this.players[i].bets = sp.bets;
      this.players[i].balance = sp.balance;
      this.players[i].insurance = sp.insurance;
      this.players[i].hasBeenOfferedInsurance = sp.hasBeenOfferedInsurance;
      this.players[i].handStates = sp.handStates;
      this.players[i].active = sp.active;
      this.players[i].currentBet = sp.currentBet;
      this.players[i].balanceBeforeRound = sp.balanceBeforeRound;
      this.players[i].payoutMessage = sp.payoutMessage;
      this.players[i].payoutAmount = sp.payoutAmount;
    }

    this.message = state.message;
    this.messageTimer = state.messageTimer;
    this.messageColor = state.messageColor;
    this.refreshMenu();
  }
}
