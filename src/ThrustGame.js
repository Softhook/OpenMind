/**
 * ThrustGame.js - Refactored orchestrator for the Thrust mini-game
 */

class ThrustGame {
  // ============================================================================
  // SINGLETON MANAGEMENT & SOFT DEPENDENCY INTERFACE
  // ============================================================================

  static instance = null;
  static hasRemotePlayers = false;
  static _activeManager = null;
  static _cleanupListener = null;
  static _healingInterval = null;

  /**
   * Main game loop - handles updates, drawing, and lifecycle.
   */
  static loop(collaborationManager, mindMap) {
    if (!ThrustGame.instance) {
      ThrustGame.instance = new ThrustGame(collaborationManager, mindMap);
    }
    ThrustGame.instance.collaborationManager = collaborationManager;
    ThrustGame.instance.mindMap = mindMap;

    if (collaborationManager && collaborationManager !== ThrustGame._activeManager) {
      ThrustGame._setupAwarenessListener(collaborationManager);
      ThrustGame._activeManager = collaborationManager;
    }

    const isLocalActive = ThrustGame.instance.active;
    if (!isLocalActive && !ThrustGame.hasRemotePlayers) {
      if (window.ExtensionBridge) window.ExtensionBridge.draw = null;
      if (ThrustGame.instance) {
        ThrustGame.instance.destroy();
        ThrustGame.instance = null;
      }
      return;
    }

    if (isLocalActive) ThrustGame.instance.update();
    ThrustGame.instance.updateRemotePlayers();
    ThrustGame.instance.interpolateRemotePlayers();
    ThrustGame.instance.draw();

    if (!isLocalActive) {
      ThrustGame.instance.updateRemoteBullets();
      ThrustGame.instance.updateExplosions();
    }
    ThrustGame.instance.drawUI();
  }

  static _setupAwarenessListener(manager) {
    if (ThrustGame._cleanupListener) {
      ThrustGame._cleanupListener();
      ThrustGame._cleanupListener = null;
    }

    if (!manager || !manager.awareness) {
      ThrustGame.hasRemotePlayers = false;
      return false;
    }

    const awareness = manager.awareness;
    const checkActivity = () => {
      // Use the captured awareness reference directly for maximum safety
      if (!awareness || awareness._destroyed) return;
      
      try {
        const states = awareness.getStates();
        const myClientId = awareness.clientID;
        let foundRemote = false;
        for (const [clientId, state] of states) {
          if (clientId !== myClientId && state.thrustGame) {
            foundRemote = true;
            break;
          }
        }
        ThrustGame.hasRemotePlayers = foundRemote;

        if (foundRemote && window.ExtensionBridge && !window.ExtensionBridge.draw) {
          window.ExtensionBridge.draw = ThrustGame.loop;
          ThrustGame.loop(manager, null);
        }
      } catch (e) {
        // Fallback for destroyed awareness
        ThrustGame.hasRemotePlayers = false;
      }
    };

    awareness.on('change', checkActivity);
    checkActivity();

    if (ThrustGame.hasRemotePlayers && window.ExtensionBridge) {
      window.ExtensionBridge.draw = ThrustGame.loop;
    }

    ThrustGame._cleanupListener = () => {
      try {
        awareness.off('change', checkActivity);
      } catch (e) {}
      ThrustGame.hasRemotePlayers = false;
    };

    return true;
  }

  static handleInput(key, keyCode, mindMap, options = {}) {
    const isCtrl = options.isCtrl ?? ThrustGame._isCtrlPressed();
    if (key.toLowerCase() === 't' && isCtrl) {
      ThrustGame.toggle(mindMap);
      return true;
    }
    if (ThrustGame.instance && ThrustGame.instance.active) {
      return ThrustGame.instance.handleKeyPressed(key, keyCode);
    }
    return false;
  }

  static _isCtrlPressed() {
    try {
      if (typeof keyIsDown === 'function' && keyIsDown(17)) return true;
      if (typeof window !== 'undefined' && window.event && window.event.ctrlKey) return true;
    } catch (e) {}
    return false;
  }

  static handleKeyReleased(keyCode) {
    if (ThrustGame.instance && ThrustGame.instance.active) {
      ThrustGame.instance.handleKeyReleased(keyCode);
      return true;
    }
    return false;
  }

  static toggle(mindMap) {
    if (!ThrustGame.instance) ThrustGame.instance = new ThrustGame(null, mindMap);
    if (!ThrustGame.instance.active) {
      ThrustGame.instance.start();
    } else {
      ThrustGame.instance.stop();
    }
  }

  // ============================================================================
  // INSTANCE METHODS
  // ============================================================================

  constructor(collaborationManager = null, mindMap = null) {
    this.collaborationManager = collaborationManager;
    this.mindMap = mindMap;
    this.active = false;

    this.player = this.createPlayer();
    this.bullets = [];
    this.remotePlayers = new Map();
    this.remoteBullets = new Map();
    this.explosions = [];

    this.keys = { left: false, right: false, up: false, down: false };
    this.lastFireTime = 0;
    this.score = 0;
    this.deaths = 0;

    this.lastMovementTime = Date.now();
    this.isIdle = false;
    this.lastBroadcast = 0;
    this.lastBroadcastState = null;
    this.multiplayerInitialized = false;
    this.remotePlayerStateTimestamps = new Map();
    this.remoteClockOffsets = new Map();
    this.damagedBoxIds = new Set();
    this.processedHits = new Set();
    this.pendingHitNotifications = [];
    this.hitBroadcastTimer = 0;
    this.lastHealthRecoveryCheck = 0;

    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.setupMultiplayer();
    }
  }

  createPlayer() {
    let spawnX = 300, spawnY = 200;
    if (this.mindMap && this.mindMap.boxes && this.mindMap.boxes.length > 0) {
      let sumX = 0, sumY = 0, count = 0;
      for (const box of this.mindMap.boxes) {
        if (box && box.x != null && box.y != null) {
          sumX += box.x; sumY += box.y; count++;
        }
      }
      if (count > 0) {
        const centerX = sumX / count, centerY = sumY / count;
        const searchRadius = ThrustConstants.SPAWN.SEARCH_RADIUS;
        const minDistance = ThrustConstants.SPAWN.MIN_DISTANCE_FROM_BOX;
        for (let i = 0; i < ThrustConstants.SPAWN.MAX_ATTEMPTS; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = searchRadius * (0.2 + Math.random() * 0.8);
          const tx = centerX + Math.cos(angle) * dist, ty = centerY + Math.sin(angle) * dist;
          if (ThrustUtils.isValidSpawnPosition(tx, ty, this.mindMap.boxes, minDistance)) {
            spawnX = tx; spawnY = ty; break;
          }
        }
      }
    }

    return new ThrustShip({
      x: spawnX, y: spawnY,
      invulnerableUntil: Date.now() + ThrustConstants.PLAYER.INVULNERABLE_TIME,
      color: ThrustConstants.COLORS.PLAYER_LOCAL
    });
  }

  start() {
    this.active = true;
    if (window.ExtensionBridge) window.ExtensionBridge.draw = ThrustGame.loop;
    this.player = this.createPlayer();
    this.bullets = []; this.score = 0; this.deaths = 0;
    this.keys = { left: false, right: false, up: false, down: false };
    this.lastMovementTime = Date.now(); this.isIdle = false;

    if (typeof MindMap !== 'undefined') {
      MindMap.onBoxHealthChanged = (boxId, health) => this.notifyBoxHealthChanged(boxId, health);
    }

    if (this.mindMap && this.mindMap.boxes) {
      for (const box of this.mindMap.boxes) {
        if (box) {
          delete box.wasExploded; // Reset explosion flag for new session
          if (box.health !== undefined && box.health < 5) this.damagedBoxIds.add(box.id);
        }
      }
    }

    if (this.collaborationManager && this.collaborationManager.isConnected) {
      this.setupMultiplayer();
      this.broadcastPlayerState(true);
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (typeof MindMap !== 'undefined') MindMap.onBoxHealthChanged = null;

    if (this.damagedBoxIds.size > 0 && this.mindMap) {
      ThrustGame._startHealingLoop(this.mindMap, new Set(this.damagedBoxIds));
    }

    if (this.collaborationManager && this.collaborationManager.awareness) {
      this.collaborationManager.awareness.setLocalStateField('thrustGame', null);
    }

    this.bullets = []; this.remotePlayers.clear(); this.remoteBullets.clear(); this.explosions = [];
    this.processedHits.clear(); this.pendingHitNotifications = [];
    ThrustGame.hasRemotePlayers = false;
  }

  destroy() {
    this.stop();
    if (ThrustGame.instance === this) {
      ThrustGame.instance = null;
      if (typeof ThrustAudio !== 'undefined') {
        ThrustAudio.setThrust(false);
        ThrustAudio.cleanup();
      }
    }
    this.collaborationManager = null; this.mindMap = null;
  }

  update() {
    if (!this.player.alive && Date.now() >= this.player.respawnTime) {
      this.player = this.createPlayer();
      if (this.collaborationManager) this.broadcastPlayerState(true);
    }

    if (!this.active && !ThrustGame.hasRemotePlayers) return;

    this.syncKeyboardState();

    if (this.player.alive && this.keys.up) {
      if (typeof ThrustAudio !== 'undefined') ThrustAudio.setThrust(true);
    } else {
      if (typeof ThrustAudio !== 'undefined') ThrustAudio.setThrust(false);
    }

    this.updateBullets();
    this.updateExplosions();
    this.updateHealthRecovery();

    const now = Date.now();
    if (this.collaborationManager && (!this.lastBroadcast || now - this.lastBroadcast > 100)) {
      this.broadcastPlayerState();
      this.lastBroadcast = now;
    }

    if (this.player.alive) {
      const wasGrounded = this.player.grounded;
      this.player.updatePhysics(this.keys, this.mindMap);

      // Play landing sound on touchdown
      if (!wasGrounded && this.player.grounded) {
        if (typeof ThrustAudio !== 'undefined') ThrustAudio.playLanding();
      } else if (this.player.justBounced) {
        if (typeof ThrustAudio !== 'undefined') ThrustAudio.playBounce();
      }
      if (typeof CameraUtils !== 'undefined' && typeof width !== 'undefined' && !CameraUtils.isPanning) {
        CameraUtils.centerOn(this.player.x, this.player.y, width, height);
      }
      this.checkCollisions();
    }
  }

  updateBullets() {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update();
      const hitBox = b.checkCollision(this.mindMap);
      if (hitBox) {
        this.applyBulletForceToBox(hitBox, b);
        this.bullets.splice(i, 1);
      } else if (b.lifetime <= 0) {
        this.bullets.splice(i, 1);
      }
    }
    this.updateRemoteBullets();
  }

  updateRemoteBullets() {
    for (const [id, b] of this.remoteBullets) {
      b.update();
      const hitBox = b.checkCollision(this.mindMap);
      if (hitBox) {
        this.applyBulletForceToBox(hitBox, b);
        this.remoteBullets.delete(id);
      } else if (b.lifetime <= 0) {
        this.remoteBullets.delete(id);
      } else if (this.player.alive && Date.now() > this.player.invulnerableUntil && b.checkHit(this.player.x, this.player.y)) {
        this.handlePlayerDeath();
        this.remoteBullets.delete(id);
      }
    }
  }

  updateExplosions() {
    this.explosions = this.explosions.filter(e => !e.isExpired());
  }

  updateHealthRecovery() {
    const now = Date.now();
    if (now - this.lastHealthRecoveryCheck < 1000 || !this.mindMap || this.damagedBoxIds.size === 0) return;
    this.lastHealthRecoveryCheck = now;

    const recovered = [];
    for (const id of this.damagedBoxIds) {
      const box = this.mindMap.getBoxById(id);
      if (!box || box.isDeleted || (box.health !== undefined && box.health <= 0)) {
        recovered.push(id); continue;
      }
      if (box.health !== undefined && box.health < 5 && box.lastHitTime > 0) {
        if (now - box.lastHitTime >= ThrustConstants.HEALTH.RECOVERY_DELAY) {
          box.health++;
          box.lastHitTime = now - (ThrustConstants.HEALTH.RECOVERY_DELAY - ThrustConstants.HEALTH.RECOVERY_RATE);
          if (box.health >= 5) { delete box.health; delete box.lastHitTime; delete box.wasExploded; recovered.push(id); }
          if (typeof MindMap !== 'undefined' && MindMap.onBoxChange) MindMap.onBoxChange(box, false, null);
        }
      } else {
        if (box.health !== undefined) { delete box.health; delete box.lastHitTime; delete box.wasExploded; }
        recovered.push(id);
      }
    }
    for (const id of recovered) this.damagedBoxIds.delete(id);
  }

  notifyBoxHealthChanged(id, health) {
    if (health !== undefined && health < 5) this.damagedBoxIds.add(id);
    else this.damagedBoxIds.delete(id);
  }

  applyBulletForceToBox(box, bullet) {
    if (!box) return;
    const speed = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
    if (speed < ThrustConstants.COLLISION.VELOCITY_EPSILON) return;

    box.x += (bullet.vx / speed) * ThrustConstants.BULLET.BOX_PUSH_FORCE;
    box.y += (bullet.vy / speed) * ThrustConstants.BULLET.BOX_PUSH_FORCE;

    if (typeof box.reduceHealth === 'function') {
      const currentHealth = box.health === undefined ? 5 : box.health;
      box.reduceHealth();
      const newHealth = box.health === undefined ? 5 : box.health;

      // Only trigger explosion exactly once when health hits 0 or less
      // Use transient wasExploded flag to prevent multiple triggers if multiple bullets hit in one frame
      if (newHealth <= 0 && !box.wasExploded) {
        box.wasExploded = true;
        const scale = Math.sqrt((box.width * box.height) / 16000);
        this.createExplosion(box.x, box.y, 'box', box.backgroundColor, scale);
      } else if (newHealth > 0) {
        if (typeof ThrustAudio !== 'undefined') {
          ThrustAudio.playImpact();
        }
      }
      
      if (newHealth < 5) this.damagedBoxIds.add(box.id);
      else this.damagedBoxIds.delete(box.id);
    }

    if (box.targetX !== undefined) { box.targetX = box.x; box.targetY = box.y; }
    if (this.collaborationManager && this.collaborationManager.isConnected) {
      if (box.health > 0) this.collaborationManager.syncBoxToYjs(box, false, null);
    } else if (box.health > 0 && typeof MindMap !== 'undefined' && MindMap.onBoxChange) {
      MindMap.onBoxChange(box, false, null);
    }
  }

  createExplosion(x, y, type = 'player', color = null, scale = 1.0) {
    this.explosions.push(new ThrustExplosion({ x, y, type, color, scale }));
    if (typeof ThrustAudio !== 'undefined') {
      ThrustAudio.playExplosion(scale);
    }
  }

  checkCollisions() {
    // Check local bullets hitting remote players
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.scored) continue;
      for (const [id, remote] of this.remotePlayers) {
        if (remote.alive && b.checkHit(remote.x, remote.y)) {
          this.score++;
          b.scored = true;
          this.createExplosion(remote.x, remote.y, 'player', remote.color);
          remote.wasExploded = true;
          this.broadcastHit(id);
          this.bullets.splice(i, 1);
          break;
        }
      }
    }

    // Check remote bullets hitting local player
    if (this.player.alive && Date.now() > this.player.invulnerableUntil) {
      for (const [id, b] of this.remoteBullets) {
        if (b.checkHit(this.player.x, this.player.y)) {
          this.handlePlayerDeath();
          this.remoteBullets.delete(id);
          break;
        }
      }
    }
  }

  handlePlayerDeath() {
    if (!this.player.alive || this.player.wasExploded) return;
    this.player.alive = false;
    this.player.respawnTime = Date.now() + ThrustConstants.PLAYER.RESPAWN_TIME;
    this.player.wasExploded = true;
    this.deaths++;
    this.createExplosion(this.player.x, this.player.y, 'player', this.player.color);
    if (this.collaborationManager) this.broadcastPlayerState(true);
  }

  handleKeyPressed(key, keyCode) {
    if (!this.active) return;
    const K = ThrustConstants.KEY_CODES;
    if (keyCode === K.LEFT) this.keys.left = true;
    else if (keyCode === K.RIGHT) this.keys.right = true;
    else if (keyCode === K.UP) this.keys.up = true;
    else if (keyCode === K.DOWN) this.keys.down = true;
    if (keyCode === K.SPACE || key === ' ') this.fireBullet();
    return true;
  }

  handleKeyReleased(keyCode) {
    const K = ThrustConstants.KEY_CODES;
    if (keyCode === K.LEFT) this.keys.left = false;
    else if (keyCode === K.RIGHT) this.keys.right = false;
    else if (keyCode === K.UP) this.keys.up = false;
    else if (keyCode === K.DOWN) this.keys.down = false;
  }

  syncKeyboardState() {
    if (!this.active || typeof keyIsDown !== 'function') return;
    for (const { name, code } of ThrustConstants.KEY_MAP) {
      if (this.keys[name] && !keyIsDown(code)) this.keys[name] = false;
    }
  }

  fireBullet() {
    if (!this.player.alive) return;
    const now = Date.now();
    if (now - this.lastFireTime < ThrustConstants.BULLET.COOLDOWN * ThrustConstants.TIMING.FRAME_TIME_MS) return;
    this.lastFireTime = now;

    const b = new ThrustBullet({
      x: this.player.x + Math.cos(this.player.angle) * ThrustConstants.PLAYER.SIZE,
      y: this.player.y + Math.sin(this.player.angle) * ThrustConstants.PLAYER.SIZE,
      vx: Math.cos(this.player.angle) * ThrustConstants.BULLET.SPEED + this.player.vx,
      vy: Math.sin(this.player.angle) * ThrustConstants.BULLET.SPEED + this.player.vy
    });
    this.bullets.push(b);
    if (typeof ThrustAudio !== 'undefined') {
      ThrustAudio.playFire();
    }
  }

  draw() {
    if (this.remotePlayers.size === 0 && !this.active) return;
    const margin = 1000;
    const vBounds = (typeof CameraUtils !== 'undefined') ? {
      left: CameraUtils.worldX(0) - margin, right: CameraUtils.worldX(width) + margin,
      top: CameraUtils.worldY(0) - margin, bottom: CameraUtils.worldY(height) + margin
    } : null;

    const inV = (x, y) => !vBounds || (x >= vBounds.left && x <= vBounds.right && y >= vBounds.top && y <= vBounds.bottom);

    for (const [id, remote] of this.remotePlayers) {
      if (remote.alive && inV(remote.x, remote.y)) remote.draw(remote.isInvulnerable);
    }

    for (const b of this.bullets) if (inV(b.x, b.y)) b.draw(true);
    for (const [id, b] of this.remoteBullets) if (inV(b.x, b.y)) b.draw(false);
    
    // Always draw all active explosions to prevent culling glitches
    for (const e of this.explosions) e.draw();

    if (this.active && this.player.alive) {
      this.player.draw(Date.now() < this.player.invulnerableUntil);
    }
  }

  drawUI() {
    if (!this.active) return;
    push(); resetMatrix(); rectMode(CORNER); textAlign(LEFT, TOP); fill(ThrustConstants.COLORS.UI_TEXT); textSize(14);
    fill(0, 0, 0, 150); noStroke(); rect(5, 5, 120, 60, 5);
    fill(ThrustConstants.COLORS.UI_TEXT); text(`Score: ${this.score}`, 10, 10); text(`Deaths: ${this.deaths}`, 10, 28); text('Ctrl+T: Exit', 10, 46);

    if (!this.player.alive) {
      textSize(24); textAlign(CENTER, CENTER);
      const timeLeft = Math.ceil((this.player.respawnTime - Date.now()) / 1000);
      if (timeLeft > 0) {
        fill(0, 0, 0, 180); rect(width / 2 - 150, height / 2 - 40, 300, 80, 10);
        fill(ThrustConstants.COLORS.UI_TEXT); text(`Respawning in ${timeLeft}...`, width / 2, height / 2);
      }
    }

    if (this.collaborationManager && this.collaborationManager.isConnected) {
      textSize(12); textAlign(RIGHT, TOP);
      fill(0, 0, 0, 150); noStroke(); rect(width - 115, 5, 110, 24, 5);
      fill(ThrustConstants.COLORS.UI_TEXT); text(`Players: ${this.remotePlayers.size + 1}`, width - 10, 10);
    }
    pop();
  }

  setupMultiplayer() {
    if (!this.collaborationManager || !this.collaborationManager.awareness || this.multiplayerInitialized) return;
    this.multiplayerInitialized = true;
    this.updateRemotePlayers();
  }

  updateRemotePlayers() {
    if (!this.collaborationManager || !this.collaborationManager.awareness) return;
    const states = this.collaborationManager.awareness.getStates(), myClientId = this.collaborationManager.awareness.clientID;
    const active = new Set();

    states.forEach((state, id) => {
      if (id === myClientId || !state.thrustGame) return;
      const tg = state.thrustGame;
      if (!Number.isFinite(tg.x) || !Number.isFinite(tg.y)) return;
      active.add(id);

      const now = Date.now(), updateT = tg.t || now;
      if (this.remotePlayerStateTimestamps.get(id) >= updateT) return;
      this.remotePlayerStateTimestamps.set(id, updateT);

      const rawDelta = now - updateT;
      if (!this.remoteClockOffsets.has(id) || rawDelta < this.remoteClockOffsets.get(id)) this.remoteClockOffsets.set(id, rawDelta);
      const latFrames = Math.min(120, (rawDelta - this.remoteClockOffsets.get(id)) / ThrustConstants.TIMING.FRAME_TIME_MS);

      let p = this.remotePlayers.get(id);
      if (!p) {
        p = new ThrustShip({ x: tg.x, y: tg.y, vx: tg.vx, vy: tg.vy, angle: tg.angle, name: state.user?.name, color: state.user?.color });
        this.remotePlayers.set(id, p);
      }
      
      if (p.alive && tg.alive === false && !p.wasExploded) {
        this.createExplosion(p.x, p.y, 'player', p.color);
        p.wasExploded = true;
      } else if (tg.alive !== false) {
        p.wasExploded = false;
      }
      
      p.targetX = tg.x; p.targetY = tg.y; p.targetAngle = tg.angle;
      p.vx = tg.vx || 0; p.vy = tg.vy || 0; p.alive = tg.alive !== false;
      p.thrusting = !!tg.thrusting; p.isInvulnerable = !!tg.isInvulnerable;
      p.name = (state.user?.name || 'Player').substring(0, 20);
      p.color = state.user?.color || ThrustConstants.DEFAULT_PLAYER_COLOR;

      if (tg.bullets && Array.isArray(tg.bullets)) {
        const bIds = new Set();
        for (const bData of tg.bullets) {
          if (!bData.id) continue;
          bIds.add(bData.id);
          const exX = bData.x + bData.vx * latFrames, exY = bData.y + bData.vy * latFrames, lt = bData.lifetime - latFrames;
          if (lt <= 0) continue;
          let b = this.remoteBullets.get(bData.id);
          if (!b) {
            b = new ThrustBullet({ id: bData.id, x: exX, y: exY, vx: bData.vx, vy: bData.vy, lifetime: lt, clientId: id });
            this.remoteBullets.set(bData.id, b);
            if (typeof ThrustAudio !== 'undefined') {
              ThrustAudio.playFire();
            }
          }
          b.targetX = exX; b.targetY = exY; b.vx = bData.vx; b.vy = bData.vy; b.lifetime = lt;
        }
        for (const [bid, b] of this.remoteBullets) if (b.clientId === id && !bIds.has(bid)) this.remoteBullets.delete(bid);
      }

      if (tg.hitNotifications) {
        for (const hit of tg.hitNotifications) {
          if (hit.id && this.processedHits.has(hit.id)) continue;
          if (hit.target === myClientId && this.player.alive && Date.now() > this.player.invulnerableUntil) {
            if (hit.id) { this.processedHits.add(hit.id); if (this.processedHits.size > 100) this.processedHits.clear(); }
            this.handlePlayerDeath(); break;
          }
        }
      }
    });

    ThrustGame.hasRemotePlayers = active.size > 0;
    for (const [id, p] of this.remotePlayers) {
      if (!active.has(id)) {
        this.remotePlayers.delete(id); this.remotePlayerStateTimestamps.delete(id); this.remoteClockOffsets.delete(id);
        for (const [bid, b] of this.remoteBullets) if (b.clientId === id) this.remoteBullets.delete(bid);
      }
    }
  }

  broadcastPlayerState(force = false) {
    if (!this.collaborationManager || !this.collaborationManager.awareness) return;
    const p = this.player;
    const cur = {
      x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, angle: Math.round(p.angle * 100) / 100,
      alive: p.alive, isInvulnerable: Date.now() < p.invulnerableUntil, thrusting: this.keys.up, bulletCount: this.bullets.length
    };

    let moved = !this.lastBroadcastState || force;
    if (this.lastBroadcastState) {
      moved = moved || Math.abs(cur.x - this.lastBroadcastState.x) > 0.1 || Math.abs(cur.y - this.lastBroadcastState.y) > 0.1 ||
              Math.abs(cur.angle - this.lastBroadcastState.angle) > 0.01 || cur.alive !== this.lastBroadcastState.alive ||
              cur.thrusting !== this.lastBroadcastState.thrusting || cur.bulletCount !== this.lastBroadcastState.bulletCount;
    }

    const now = Date.now();
    if (this.keys.left || this.keys.right || this.keys.up || this.keys.down || this.bullets.length > 0 || moved) {
      this.lastMovementTime = now; this.isIdle = false;
    } else if (now - this.lastMovementTime > 2000) {
      if (!this.isIdle) this.isIdle = true; else return;
    }

    if (!Number.isFinite(cur.x) || !Number.isFinite(cur.y)) return;

    this.collaborationManager.awareness.setLocalStateField('thrustGame', {
      t: now, x: cur.x, y: cur.y, angle: cur.angle, alive: cur.alive,
      isInvulnerable: cur.isInvulnerable, thrusting: cur.thrusting,
      bullets: this.bullets.map(b => ({ id: b.id, x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, vx: Math.round(b.vx * 10) / 10, vy: Math.round(b.vy * 10) / 10, lifetime: b.lifetime })),
      hitNotifications: this.pendingHitNotifications || []
    });

    if (this.hitBroadcastTimer > 0) this.hitBroadcastTimer--; else this.pendingHitNotifications = [];
    this.lastBroadcastState = cur;
  }

  broadcastHit(targetId) {
    if (!this.pendingHitNotifications) this.pendingHitNotifications = [];
    const hitId = `hit_${targetId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    if (this.pendingHitNotifications.length < 10) {
      this.pendingHitNotifications.push({ id: hitId, target: targetId, timestamp: Date.now() });
      this.hitBroadcastTimer = 5;
    }
  }

  interpolateRemotePlayers() {
    for (const [id, p] of this.remotePlayers) p.interpolate(0.3);
  }

  static _startHealingLoop(mindMap, ids) {
    if (ThrustGame._healingInterval !== null) { clearInterval(ThrustGame._healingInterval); ThrustGame._healingInterval = null; }
    if (!mindMap || ids.size === 0) return;
    let handle;
    handle = setInterval(() => {
      if (!mindMap || typeof mindMap.getBoxById !== 'function') {
        clearInterval(handle); if (ThrustGame._healingInterval === handle) ThrustGame._healingInterval = null;
        return;
      }
      const now = Date.now(), recovered = [];
      for (const id of ids) {
        if (ThrustGame.instance && ThrustGame.instance.active) { recovered.push(id); continue; }
        const box = mindMap.getBoxById(id);
        if (!box || box.isDeleted || (box.health !== undefined && box.health <= 0)) { recovered.push(id); continue; }
        if (box.health === undefined || box.health >= 5) {
          if (box.health !== undefined) { 
            delete box.health; delete box.lastHitTime; delete box.wasExploded;
            if (typeof MindMap !== 'undefined' && MindMap.onBoxChange) MindMap.onBoxChange(box, false, null); 
          }
          recovered.push(id); continue;
        }
        if (box.health > 0 && box.lastHitTime > 0 && now - box.lastHitTime >= ThrustConstants.HEALTH.RECOVERY_DELAY) {
          box.health++; box.lastHitTime = now - (ThrustConstants.HEALTH.RECOVERY_DELAY - ThrustConstants.HEALTH.RECOVERY_RATE);
          if (box.health >= 5) { delete box.health; delete box.lastHitTime; delete box.wasExploded; }
          if (typeof MindMap !== 'undefined' && MindMap.onBoxChange) MindMap.onBoxChange(box, false, null);
          if (box.health >= 5 || box.health === undefined) recovered.push(id);
        }
      }
      for (const id of recovered) ids.delete(id);
      if (ids.size === 0) { clearInterval(handle); if (ThrustGame._healingInterval === handle) ThrustGame._healingInterval = null; }
    }, 1000);
    ThrustGame._healingInterval = handle;
  }
}


// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) module.exports = ThrustGame;

// SELF-REGISTRATION
{
  if (window.ExtensionBridge) {
    window.ExtensionBridge.handleInput = ThrustGame.handleInput;
    window.ExtensionBridge.handleKeyReleased = ThrustGame.handleKeyReleased;
    Object.defineProperty(ThrustGame.loop, 'active', { get: () => ThrustGame.instance ? ThrustGame.instance.active : false });
  }
}
