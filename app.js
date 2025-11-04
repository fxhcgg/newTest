// ------- 全局状态 -------
let floorImg = null;
let rooms = [];
let worldParams = null;

let canvas, ctx;
let selectedRoomId = null;
let startPos = null; // {x, y} in floor image px
let destPos = null;  // {x, y} centroid of room polygon

let headingDeg = null; // 来自 DeviceOrientation / webkitCompassHeading

// ------- 初始化 -------
window.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("floor-canvas");
  ctx = canvas.getContext("2d");

  setupTabs();
  loadAssets().then(() => {
    setupUI();
    drawFloor();
  });

  setupARButton();
});

// ------- 加载本地静态资源（无文件选择器） -------
async function loadAssets() {
  // 预加载平面图
  floorImg = await loadImage("Floor6.png");

  // canvas 尺寸与图片一致，坐标好算
  canvas.width = floorImg.width;
  canvas.height = floorImg.height;

  // 加载房间多边形
  const roomsData = await fetch("./rooms_manual.json").then((r) => r.json());
  rooms = roomsData.rooms || roomsData;

  // 加载 world -> floor 仿射参数
  worldParams = await fetch("./world_to_floor_params.json").then((r) => r.json());
}

// 简单图片加载 Promise
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ------- UI 初始化 -------
function setupUI() {
  const destSelect = document.getElementById("dest-room");
  destSelect.innerHTML = "";

  rooms.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = room.name || `Room ${room.id}`;
    destSelect.appendChild(option);
  });

  if (rooms.length > 0) {
    selectedRoomId = rooms[0].id;
    destPos = getRoomCentroid(rooms[0]);
  }

  destSelect.addEventListener("change", () => {
    selectedRoomId = Number(destSelect.value);
    const room = rooms.find((r) => r.id === selectedRoomId);
    destPos = getRoomCentroid(room);
    drawFloor();
  });

  // 点击画布设置当前位置
  canvas.addEventListener("click", (evt) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (evt.clientX - rect.left) * scaleX;
    const y = (evt.clientY - rect.top) * scaleY;

    startPos = { x, y };
    drawFloor();
  });

  document.getElementById("set-start-help").addEventListener("click", () => {
    alert("在下面的平面图上点一下，即可设置当前位置（红点）。");
  });
}

// ------- 平面图绘制 -------
function drawFloor() {
  if (!floorImg) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(floorImg, 0, 0);

  // 画所有房间边界
  ctx.lineWidth = 2;
  rooms.forEach((room) => {
    const pts = room.points;
    if (!pts || pts.length === 0) return;

    const isSelected = room.id === selectedRoomId;

    ctx.beginPath();
    pts.forEach((p, idx) => {
      const [x, y] = p;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();

    if (isSelected) {
      ctx.fillStyle = "rgba(0, 150, 255, 0.25)";
      ctx.fill();
      ctx.strokeStyle = "#007aff";
    } else {
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
    }
    ctx.stroke();
  });

  // 当前点位置
  if (startPos) {
    ctx.beginPath();
    ctx.arc(startPos.x, startPos.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ff3b30";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 目标房间中心
  if (destPos) {
    ctx.beginPath();
    ctx.arc(destPos.x, destPos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#34c759";
    ctx.fill();
  }
}

// 多边形质心（简单平均）
function getRoomCentroid(room) {
  const pts = room.points;
  let sx = 0,
    sy = 0;
  pts.forEach(([x, y]) => {
    sx += x;
    sy += y;
  });
  return {
    x: sx / pts.length,
    y: sy / pts.length,
  };
}

// ------- Tab 切换 -------
function setupTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const contents = document.querySelectorAll(".tab-content");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;

      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      contents.forEach((c) =>
        c.classList.toggle("active", c.id === tabId)
      );
    });
  });
}

// ------- AR 相关 -------
function setupARButton() {
  const btn = document.getElementById("start-ar");
  btn.addEventListener("click", startAR);
}

async function startAR() {
  if (!startPos || !destPos) {
    alert("请先在平面图上点击设置当前位置，并选择目标房间。");
    return;
  }

  // 打开 AR tab
  document
    .querySelectorAll(".tab-button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === "ar-tab"));
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.toggle("active", c.id === "ar-tab"));

  const statusEl = document.getElementById("ar-status");
  const video = document.getElementById("camera");

  // 摄像头
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = stream;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "无法打开摄像头：" + err.message;
  }

  // 方向传感器
  try {
    await initOrientationSensor();
    statusEl.textContent = "传感器已开启，按照箭头方向前进。";
  } catch (e) {
    console.error(e);
    statusEl.textContent = e.message || "方向传感器不可用。";
  }
}

// 初始化 DeviceOrientation（兼容 iOS / Android）
async func
