// ------- 全局状态 -------
let floorImg = null;
let rooms = [];
let worldParams = null;

let canvas, ctx;
let selectedRoomId = null;
let startPos = null; // {x, y} in floor image px
let destPos = null;  // {x, y} centroid of room polygon

let headingDeg = null; // 来自 DeviceOrientation alpha

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

  // 设置 canvas 大小 = 图片大小，避免坐标缩放混乱
  canvas.width = floorImg.width;
  canvas.height = floorImg.height;

  // 加载房间多边形
  const roomsData = await fetch("./rooms_manual.json").then((r) => r.json());
  rooms = roomsData.rooms || roomsData;

  // 加载 world -> floor 的仿射参数
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
    // 因为 canvas 的 CSS 宽度可能与实际宽度不同，需要算比例
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

// 多边形质心（简单平均，足够用）
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

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = stream;
    statusEl.textContent = "摄像头已开启，旋转手机对准箭头指示方向。";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "无法打开摄像头：" + err.message;
  }

  // 设备方向（罗盘）
  if (window.DeviceOrientationEvent) {
    // iOS 13+ 需要权限
    if (
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") {
          statusEl.textContent = "未授权使用方向传感器。";
          return;
        }
      } catch (e) {
        statusEl.textContent = "请求方向传感器权限失败。";
        console.error(e);
        return;
      }
    }

    window.addEventListener("deviceorientation", handleOrientation, true);
  } else {
    statusEl.textContent = "当前设备不支持 DeviceOrientation。";
  }
}

function handleOrientation(evt) {
  // alpha: 以正北为 0° 的方位角（大多数设备是这样，但各浏览器略有差异）
  if (evt.absolute === true || evt.alpha != null) {
    headingDeg = evt.alpha;
    updateArrow();
  }
}

function updateArrow() {
  const arrowEl = document.getElementById("arrow");
  const statusEl = document.getElementById("ar-status");

  if (!startPos || !destPos) {
    statusEl.textContent = "请先在平面图上设置当前位置与目标。";
    return;
  }
  if (headingDeg == null) {
    statusEl.textContent = "正在读取方向传感器…";
    return;
  }

  // floor 平面坐标 → 方位角（0° 指向“上方/北”，顺时针为正）
  const dx = destPos.x - startPos.x;
  const dy = destPos.y - startPos.y;

  // 画布 y 向下，所以这里用 -dy，让上方当成“北”
  const bearingRad = Math.atan2(dx, -dy);
  let bearingDeg = (bearingRad * 180) / Math.PI; // [-180,180]

  if (bearingDeg < 0) bearingDeg += 360;

  // 相对方向 = 目标方位角 - 手机朝向
  let rel = bearingDeg - headingDeg;
  // 归一化到 [-180,180]
  rel = ((rel + 540) % 360) - 180;

  arrowEl.style.transform = `translate(-50%, -50%) rotate(${rel}deg)`;

  const distancePx = Math.hypot(dx, dy);
  let distanceText = "";

  if (worldParams && worldParams.meters_per_floor_px) {
    const meters = distancePx * worldParams.meters_per_floor_px;
    distanceText = `，约 ${meters.toFixed(1)} m`;
  }

  statusEl.textContent = `朝箭头方向前进${distanceText}`;
}

// ------- world 坐标 → floor 平面坐标（备用） -------
// 使用 world_to_floor_params.json 里的 affine_M_2x3，实现一个工具函数
function worldToFloor(x, y, z) {
  if (!worldParams || !worldParams.affine_M_2x3) {
    throw new Error("world_to_floor_params 未加载");
  }
  const M = worldParams.affine_M_2x3;
  // 该文件 projection_mode = "FRONT_XZ"，所以用 X,Z → 平面
  const u = x;
  const v = z;
  const px = M[0][0] * u + M[0][1] * v + M[0][2];
  const py = M[1][0] * u + M[1][1] * v + M[1][2];
  return { x: px, y: py };
}

// 你后续如果有 world 空间里的导航路径（例如从 sparse.ply / rooms_world.geojson 生成）
// 可以：pointsWorld.map(p => worldToFloor(p.x, p.y, p.z)) 然后画在 floor-canvas 上。
