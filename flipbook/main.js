// 2D Flipbook with Realistic Page Curl
// Flat top-down view like a real notebook

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Settings
let animationSpeed = 12;
let renderFps = 30;
let isPlaying = true;
let currentFrame = 0;
const totalFrames = 12;

// Timing
let lastAnimationTime = 0;
let lastRenderTime = 0;
let frames = [];

// Page flip state
let isFlipping = false;
let flipProgress = 0;
let flipStartTime = 0;
const flipDuration = 400; // ms for realistic page turn

// Setup canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Easing for natural page motion
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Generate basketball bouncing frames
function generateFrames() {
  frames = [];

  for (let i = 0; i < totalFrames; i++) {
    const frameCanvas = document.createElement('canvas');
    const ctx = frameCanvas.getContext('2d');

    frameCanvas.width = 400;
    frameCanvas.height = 550;

    // White page background with slight texture
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, 400, 550);

    // Add subtle paper texture
    ctx.fillStyle = 'rgba(0, 0, 0, 0.01)';
    for (let t = 0; t < 1000; t++) {
      const tx = Math.random() * 400;
      const ty = Math.random() * 550;
      ctx.fillRect(tx, ty, 1, 1);
    }

    const progress = i / (totalFrames - 1);
    const bounceHeight = Math.abs(Math.sin(progress * Math.PI)) * 180;
    const ballY = 420 - bounceHeight;
    const ballX = 200;

    const squash = bounceHeight < 25 ? 0.85 : 1.0;
    const radiusX = 40 * (1 / squash);
    const radiusY = 40 * squash;

    // Draw basketball
    ctx.fillStyle = '#d97835';
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 3;

    ctx.beginPath();
    const points = 32;
    for (let j = 0; j <= points; j++) {
      const angle = (j / points) * Math.PI * 2;
      const wobble = Math.sin(j * 3 + i * 0.3) * 1.5;
      const rx = radiusX + wobble;
      const ry = radiusY + wobble * 0.5;
      const px = ballX + Math.cos(angle) * rx;
      const py = ballY + Math.sin(angle) * ry;

      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Basketball seams
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(ballX, ballY - radiusY);
    ctx.quadraticCurveTo(ballX + radiusX * 0.3, ballY, ballX, ballY + radiusY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ballX, ballY - radiusY);
    ctx.quadraticCurveTo(ballX - radiusX * 0.3, ballY, ballX, ballY + radiusY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ballX - radiusX, ballY);
    ctx.quadraticCurveTo(ballX, ballY - radiusY * 0.25, ballX + radiusX, ballY);
    ctx.stroke();

    // Motion lines
    if (bounceHeight > 80) {
      ctx.strokeStyle = 'rgba(42, 42, 42, 0.2)';
      ctx.lineWidth = 2;

      for (let m = 1; m <= 3; m++) {
        const offset = m * 15;
        ctx.beginPath();
        ctx.arc(ballX, ballY + offset, radiusX * 0.65, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ground line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, 460);
    ctx.lineTo(320, 460);
    ctx.stroke();

    // Frame number
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.font = '13px monospace';
    ctx.fillText(`${i + 1}`, 20, 520);

    frames.push(frameCanvas);
  }
}

// Draw the flipbook as a flat 2D notebook
function drawNotebook() {
  // Background
  ctx.fillStyle = '#fbf9f4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (frames.length === 0) return;

  // Notebook dimensions
  const pageWidth = 400;
  const pageHeight = 550;
  const notebookX = (canvas.width - pageWidth - 100) / 2;
  const notebookY = (canvas.height - pageHeight) / 2;

  // Draw shadow under notebook
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(notebookX - 50, notebookY, pageWidth + 100, pageHeight);
  ctx.restore();

  // Draw spine/binding
  const spineX = notebookX - 50;
  const spineWidth = 50;

  ctx.fillStyle = '#e5e3df';
  ctx.fillRect(spineX, notebookY, spineWidth, pageHeight);

  // Spiral binding holes
  ctx.fillStyle = '#d0cec9';
  const holeCount = 12;
  for (let i = 0; i < holeCount; i++) {
    const holeY = notebookY + (pageHeight / (holeCount + 1)) * (i + 1);
    ctx.beginPath();
    ctx.arc(spineX + spineWidth / 2, holeY, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stack of flipped pages on the left
  if (currentFrame > 0) {
    const flippedCount = currentFrame;
    for (let i = 0; i < Math.min(flippedCount, 5); i++) {
      const offset = i * 2;
      ctx.fillStyle = '#fafafa';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;
      ctx.fillRect(spineX - pageWidth + offset, notebookY + offset, pageWidth, pageHeight);
      ctx.strokeRect(spineX - pageWidth + offset, notebookY + offset, pageWidth, pageHeight);
    }
  }

  if (!isFlipping) {
    // Draw current page (static)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(notebookX, notebookY, pageWidth, pageHeight);

    // Draw frame content
    ctx.drawImage(frames[currentFrame], notebookX, notebookY, pageWidth, pageHeight);

    // Page border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(notebookX, notebookY, pageWidth, pageHeight);

    ctx.restore();
  } else {
    // Draw page flip animation
    const eased = easeInOutQuad(flipProgress);

    // Next page underneath
    const nextFrame = (currentFrame + 1) % totalFrames;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(notebookX, notebookY, pageWidth, pageHeight);
    ctx.drawImage(frames[nextFrame], notebookX, notebookY, pageWidth, pageHeight);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(notebookX, notebookY, pageWidth, pageHeight);
    ctx.restore();

    // Flipping page with realistic curl
    drawCurledPage(
      frames[currentFrame],
      notebookX,
      notebookY,
      pageWidth,
      pageHeight,
      eased
    );
  }
}

// Draw a page with realistic curl effect
function drawCurledPage(pageCanvas, x, y, width, height, progress) {
  ctx.save();

  // Create a more natural curl that starts from the right edge
  const segments = 40;
  const curlStartX = x + width * (1 - progress); // Where the curl begins

  for (let i = 0; i < segments; i++) {
    const segmentProgress = i / segments;
    const nextProgress = (i + 1) / segments;

    const segmentX = x + width * segmentProgress;
    const nextX = x + width * nextProgress;

    if (segmentX < curlStartX) {
      // Flat part of the page (not yet curled)
      const segmentWidth = nextX - segmentX;

      ctx.drawImage(
        pageCanvas,
        width * segmentProgress, 0, width / segments, height,
        segmentX, y, segmentWidth, height
      );
    } else {
      // Curled part of the page
      const curlProgress = (segmentX - curlStartX) / (width - (curlStartX - x));

      // Curl angle and radius
      const maxCurlAngle = Math.PI * 0.95;
      const angle = curlProgress * maxCurlAngle;
      const radius = 80;

      // Calculate curl position
      const curlCenterX = curlStartX;
      const arcX = curlCenterX - Math.cos(angle) * radius;
      const arcZ = Math.sin(angle) * radius;

      // Perspective scaling based on Z depth
      const scale = 1 - (arcZ / 300);
      const perspectiveWidth = (nextX - segmentX) * scale;

      // Shadow intensity based on curl angle
      const shadowAlpha = Math.sin(angle) * 0.3;

      ctx.save();

      // Draw shadow on curled part
      if (angle > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.fillRect(arcX, y, perspectiveWidth, height * scale);
      }

      // Draw the curled segment
      ctx.globalAlpha = Math.max(0.3, 1 - curlProgress * 0.7);

      ctx.drawImage(
        pageCanvas,
        width * segmentProgress, 0, width / segments, height,
        arcX, y + (height - height * scale) / 2, perspectiveWidth, height * scale
      );

      ctx.restore();
    }
  }

  // Add curl shadow on the page below
  const shadowWidth = width * progress * 0.4;
  const shadowGradient = ctx.createLinearGradient(
    curlStartX,
    0,
    curlStartX + shadowWidth,
    0
  );
  shadowGradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
  shadowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = shadowGradient;
  ctx.fillRect(curlStartX, y, shadowWidth, height);

  // Page edge highlight (white edge of curling page)
  if (progress > 0.1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(curlStartX, y);
    ctx.lineTo(curlStartX, y + height);
    ctx.stroke();
  }

  ctx.restore();
}

// Animation loop
function animate(timestamp) {
  const animationInterval = 1000 / animationSpeed;
  const renderInterval = 1000 / renderFps;

  // Trigger page flip
  if (isPlaying && !isFlipping && timestamp - lastAnimationTime >= animationInterval) {
    isFlipping = true;
    flipStartTime = timestamp;
    flipProgress = 0;
    lastAnimationTime = timestamp;
  }

  // Update flip animation
  if (isFlipping) {
    const elapsed = timestamp - flipStartTime;
    flipProgress = Math.min(elapsed / flipDuration, 1);

    if (flipProgress >= 1) {
      isFlipping = false;
      currentFrame = (currentFrame + 1) % totalFrames;
      flipProgress = 0;
      updateFrameDisplay();
    }
  }

  // Render
  if (timestamp - lastRenderTime >= renderInterval) {
    drawNotebook();
    lastRenderTime = timestamp;
  }

  requestAnimationFrame(animate);
}

// Update frame display
function updateFrameDisplay() {
  document.getElementById('frame-val').textContent = `${currentFrame + 1} / ${totalFrames}`;
}

// UI Controls
const speedSlider = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const renderFpsSlider = document.getElementById('renderFps');
const renderFpsVal = document.getElementById('renderFps-val');
const playPauseBtn = document.getElementById('playPause');
const resetBtn = document.getElementById('reset');

speedSlider.addEventListener('input', (e) => {
  animationSpeed = parseFloat(e.target.value);
  speedVal.textContent = `${animationSpeed} fps`;
});

renderFpsSlider.addEventListener('input', (e) => {
  renderFps = parseFloat(e.target.value);
  renderFpsVal.textContent = `${renderFps} fps`;
});

playPauseBtn.addEventListener('click', () => {
  isPlaying = !isPlaying;
  playPauseBtn.textContent = isPlaying ? 'pause' : 'play';
  playPauseBtn.classList.toggle('active', isPlaying);
});

resetBtn.addEventListener('click', () => {
  currentFrame = 0;
  isFlipping = false;
  flipProgress = 0;
  lastAnimationTime = 0;
  updateFrameDisplay();
  drawNotebook();
});

// Initialize
generateFrames();
updateFrameDisplay();
requestAnimationFrame(animate);
