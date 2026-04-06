/**
 * Remote Players — Renders other players as anonymous silhouettes.
 */

import * as THREE from 'three';
import { PLAYER_COLORS, PLAYER_HEIGHT, CHAT_BUBBLE_DURATION_MS } from '../shared/constants.js';

export class PlayerManager {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); // sessionId -> { mesh, targetPos, targetRotY, chatSprite, ... }
  }

  addPlayer(sessionId, color) {
    if (this.players.has(sessionId)) return;

    const colorHex = typeof color === 'number' ? color :
      PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];

    const group = new THREE.Group();

    // Body — cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.8, 1.0, PLAYER_HEIGHT * 0.45, 6);
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = PLAYER_HEIGHT * 0.22;
    group.add(body);

    // Head — sphere
    const headGeo = new THREE.SphereGeometry(0.9, 6, 6);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = PLAYER_HEIGHT * 0.52;
    group.add(head);

    // Eyes — two small glowing spheres
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeGeo = new THREE.SphereGeometry(0.15, 4, 4);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.3, PLAYER_HEIGHT * 0.55, 0.7);
    group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.3, PLAYER_HEIGHT * 0.55, 0.7);
    group.add(rightEye);

    this.scene.add(group);

    this.players.set(sessionId, {
      mesh: group,
      targetPos: new THREE.Vector3(0, 0, 0),
      targetRotY: 0,
      chatSprite: null,
      chatTimeout: null,
      color: colorHex,
      currentArticle: '',
    });
  }

  removePlayer(sessionId) {
    const player = this.players.get(sessionId);
    if (!player) return;
    this.scene.remove(player.mesh);
    if (player.chatSprite) this.scene.remove(player.chatSprite);
    this.players.delete(sessionId);
  }

  updatePosition(sessionId, x, y, z, rotationY) {
    const player = this.players.get(sessionId);
    if (!player) return;
    player.targetPos.set(x, y, z);
    player.targetRotY = rotationY;
  }

  setPlayerArticle(sessionId, article) {
    const player = this.players.get(sessionId);
    if (!player) return;
    player.currentArticle = article;
  }

  /**
   * Show/hide players based on whether they're in the same article-room.
   */
  filterByArticle(localArticle) {
    for (const [, player] of this.players) {
      player.mesh.visible = player.currentArticle === localArticle;
    }
  }

  showChatBubble(sessionId, babelText) {
    const player = this.players.get(sessionId);
    if (!player) return;

    // Remove old bubble
    if (player.chatSprite) {
      player.mesh.remove(player.chatSprite);
    }
    if (player.chatTimeout) clearTimeout(player.chatTimeout);

    // Create text sprite
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    ctx.fillStyle = 'rgba(0, 20, 0, 0.8)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#335533';
    ctx.strokeRect(0, 0, 256, 64);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#aaffaa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Truncate if too long
    const display = babelText.length > 24 ? babelText.slice(0, 24) + '...' : babelText;
    ctx.fillText(display, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(6, 1.5, 1);
    sprite.position.y = PLAYER_HEIGHT * 0.75;

    player.mesh.add(sprite);
    player.chatSprite = sprite;

    player.chatTimeout = setTimeout(() => {
      player.mesh.remove(sprite);
      player.chatSprite = null;
    }, CHAT_BUBBLE_DURATION_MS);
  }

  /**
   * Interpolate all players toward their targets. Call each frame.
   */
  update(dt) {
    const lerpFactor = 1 - Math.pow(0.001, dt);
    for (const [, player] of this.players) {
      player.mesh.position.lerp(player.targetPos, lerpFactor);
      const currentY = player.mesh.rotation.y;
      const diff = player.targetRotY - currentY;
      player.mesh.rotation.y += diff * lerpFactor;
    }
  }

  getPlayerCount() {
    return this.players.size;
  }
}
