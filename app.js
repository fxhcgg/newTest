// ------- 全局状态 -------
let floorImg = null;
let rooms = [];
let worldParams = null;

let canvas, ctx;
let selectedRoomId = null;
let startPos = null; // {x, y} in floor image px
let destPos = null;  // {x, y} centroid of room polygon

let headingDeg = null; // 设备朝向（0 = 北）
let orientationListening = false; // 防止重复注册监听

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

// ------- 加载静态资源 -------
async function loadAssets() {
  floorImg = await loadImage("Floor6.png");

  // canvas 尺寸与图片一致，坐标好算
  canvas.width = floorImg.width;
  canvas.height = floorImg.height;

  const roomsData = await fetch("./rooms_manual.json").then((r) => r.json());
  rooms = roomsData.rooms || roomsData;

  worldParams = await fetch("./world_to_floor_params.json").then((r) => r.json());
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ------- UI -------
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

// ------- 绘制平面图 -------
function drawFloor() {
  if (!floorImg) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(floorImg, 0, 0);

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

  if (startPos) {
    ctx.beginPath();
    ctx.arc(startPos.x, startPos.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ff3b30";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (destPos) {
    ctx.beginPath();
    ctx.arc(destPos.x, destPos.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#34c759";
    ctx.fill();
  }
}

function getRoomCentroid(room) {
  const pts = room.points;
  let sx = 0,
    sy = 0;
  pts.forEach(([x, y]) => {
    sx += x;
    sy += y;
  });
  return { x: sx / pts.length, y: sy / pts.length };
}

// ------- Tabs -------
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

// ------- AR 按钮 & 主流程 -------
function setupARButton() {
  const btn = document.getElementById("start-ar");
  // 关键点：requestPermission 必须在这个点击回调里调用
  btn.addEventListener("click", onStartARClick);
}

async function onStartARClick() {
  const statusEl = document.getElementById("ar-status");

  if (!startPos || !destPos) {
    alert("请先在平面图上点击设置当前位置，并选择目标房间。");
    return;
  }

  // 先切换到 AR tab（同步操作，不影响权限弹窗）
  document
    .querySelectorAll(".tab-button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === "ar-tab"));
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.toggle("active", c.id === "ar-tab"));

  // -------- 1. 请求方向传感器权限（iOS 13+ 必须在点击回调里直接调用） --------
  let sensorSupported = typeof DeviceOrientationEvent !== "undefined";
  let sensorPermissionOk = true;

  if (!sensorSupported) {
    sensorPermissionOk = false;
    statusEl.textContent = "当前浏览器不支持 DeviceOrientation 方向传感器。";
  } else if (
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    // iOS / iPadOS 专用流程
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== "granted") {
        sensorPermissionOk = false;
        statusEl.textContent =
          "已拒绝方向传感器权限，请在 Safari 网站设置中允许“运动与方向访问”。";
      }
    } catch (e) {
      console.warn("DeviceOrientationEvent.requestPermission error:", e);
      sensorPermissionOk = false;
      statusEl.textContent =
        "请求方向传感器权限失败，请确认使用 Safari 且允许“运动与方向访问”。";
    }
  } else {
    // 没有 requestPermission（Android / 老版本 iOS），后面直接监听事件即可
    sensorPermissionOk = true;
  }

  // -------- 2. 打开摄像头 --------
  const video = document.getElementById("camera");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    video.srcObject = stream;
  } catch (err) {
    console.error("getUserMedia error", err);
    statusEl.textContent = "无法打开摄像头：" + err.message;
  }

  // -------- 3. 注册方向事件监听 --------
  if (sensorSupported) {
    startOrientationListener();
    // 简单做一个 3 秒检测：如果 3 秒后还没有任何 heading 数据，就提示可能被系统禁用
    headingDeg = null;
    setTimeout(() => {
      if (headingDeg == null) {
        statusEl.textContent =
          "未能获取方向数据，可能浏览器禁用了传感器。请在系统/浏览器设置中检查。";
      }
    }, 3000);
  }
}

// ------- 注册方向监听（iOS & Android 通用） -------
function startOrientationListener() {
  if (orientationListening) return; // 防止重复注册
  orientationListening = true;

  if ("ondeviceorientationabsolute" in window) {
    // 部分 Android 浏览器提供绝对方向事件
    window.addEventListener(
      "deviceorientationabsolute",
      handleOrientation,
      true
    );
  } else {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }
}

// ------- 处理方向事件 -------
function handleOrientation(evt) {
  const statusEl = document.getElementById("ar-status");
  let heading;

  // iOS: webkitCompassHeading = 已经校正磁北的角度，0 = 北，顺时针增加
  if (typeof evt.webkitCompassHeading === "number") {
    heading = evt.webkitCompassHeading;
  } else if (evt.absolute && typeof evt.alpha === "number") {
    // 一些 Android: alpha 直接是相对于正北
    heading = evt.alpha;
  } else if (typeof evt.alpha === "number") {
    // 退一步：相对方向，也能用（可能会有漂移）
    heading = evt.alpha;
  } else {
    statusEl.textContent =
      "方向数据不可用，请确认已授权传感器，并尝试晃动手机进行校准。";
    return;
  }

  headingDeg = heading;
  updateArrow();
}

// ------- 更新箭头 -------
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

  const dx = destPos.x - startPos.x;
  const dy = destPos.y - startPos.y;

  // 画布 y 向下，所以用 -dy，把“上方”当作北
  const bearingRad = Math.atan2(dx, -dy);
  let bearingDeg = (bearingRad * 180) / Math.PI;
  if (bearingDeg < 0) bearingDeg += 360;

  // 相对角度（让箭头指向目的地）
  let rel = bearingDeg - headingDeg;
  // 归一化到 [-180, 180]
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

// ------- world -> floor 工具（备用） -------
function worldToFloor(x, y, z) {
  if (!worldParams || !worldParams.affine_M_2x3) {
    throw new Error("world_to_floor_params 未加载");
  }
  const M = worldParams.affine_M_2x3;
  const u = x; // projection_mode = FRONT_XZ：用 X,Z
  const v = z;
  const px = M[0][0] * u + M[0][1] * v + M[0][2];
  const py = M[1][0] * u + M[1][1] * v + M[1][2];
  return { x: px, y: py };
}
