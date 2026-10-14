// ============================================================
//  場景設定 —— 這是整個專案裡「唯一需要你手動改」的檔案
//  由 Claude 建立 2026-10-14
// ============================================================
//
//  要換成真模型，只要做兩件事：
//    1. 把 Blender 匯出的 .glb 丟進 models\ 資料夾
//    2. 把下面那個場景的 model 從 null 改成檔名，例如 'models/island.glb'
//
//  model 填了就用真模型，留 null 就用程式生的假模型。
//
// ============================================================

export const SCENES = {

  island: {
    name: '島',
    model: null,                 // ← 例如 'models/island.glb'
    placeholder: 'island',       // model 是 null 時用哪種假模型（island / room）
    isOutdoor: true,             // 外面的大地圖，沒有返回鈕
    camera: {
      position: [28, 21, 28],    // 鏡頭站的位置
      target:   [0.5, 3.2, -0.5],// 鏡頭看的位置（三座島的中間）
      fov: 32,
    },
    // 用滑鼠拖動整座島。把整個 drag 拿掉（或設成 null）就不能拖了。
    drag: {
      axis: 'y',                 // 'y' = 左右拖，島像轉盤一樣轉（預設）
                                 // 'x' = 上下拖，島往前後翻
      speed: 0.0075,             // 拖同樣距離要轉多少，越大越靈敏
      damping: 0.92,             // 放手之後的滑行，越接近 1 滑越久；設 0 就是放手立刻停
      min: null,                 // 轉動範圍下限（弧度）。null = 不限制、可以一直轉
      max: null,                 // 轉動範圍上限。用 'x' 軸建議設 -0.5 / 0.9 之類，免得島翻過頭
    },
    // 漂浮：名字開頭是 float_ 的物件會自己上下飄
    float: {
      amp: 0.26,                 // 上下的幅度，越大飄越兇
      speed: 0.42,               // 飄的快慢
      tilt: 0.012,               // 順便輕輕晃一下（設 0 就只有上下，不晃）
    },
    // 流動：名字開頭是 flow_ 的物件，貼圖會一直往下捲（蜜糖瀑布就是靠這個在流）
    flow: {
      speed: 0.55,               // 流多快。負數會變成往上流
    },
  },

  dessert: {
    name: '甜點店',
    model: null,                 // ← ICECREAM SHOP 26 forGAME 匯出後填這裡
    placeholder: 'room',
    camera: {
      position: [6.5, 5.2, 6.5],
      target:   [0, 1.1, 0],
      fov: 36,
    },
  },

  room: {
    name: '房間',
    model: null,                 // ← sunni room 匯出後填這裡
    placeholder: 'room',
    broadcast: true,             // 這個房間牆上有轉播螢幕
    camera: {
      position: [5.6, 4.6, 5.6],
      target:   [0, 1.0, 0],
      fov: 38,
    },
  },

};

// ============================================================
//  神木：情緒能量球
//  要加／改情緒、調顏色，改這裡就好
// ============================================================

export const EMOTIONS = [
  { id: 'joy',   name: '快樂', color: 0xffc83d, glow: 0xff9a1f },
  { id: 'sad',   name: '難過', color: 0x5aa8e0, glow: 0x2f6fae },
  { id: 'angry', name: '生氣', color: 0xf0604d, glow: 0xc0291a },
  { id: 'gloom', name: '鬱悶', color: 0x9a86b8, glow: 0x5f4d7a },
  { id: 'calm',  name: '平靜', color: 0x6fd1b0, glow: 0x2f9e7d },
  { id: 'hope',  name: '期待', color: 0xf79ac0, glow: 0xd4568f },
];

export const TREE = {
  // 每個人每天投一顆。設 false 就可以一直投（測試、拍影片的時候好用）
  oneBallPerDay: true,

  // 樹長多快
  baseBranches: 5,        // 一顆能量都沒有的時候，至少長幾根主枝
  energyPerBranch: 2,     // 之後每幾顆能量再長出一根新主枝
  maxBranches: 34,        // 主枝數量上限（到頂之後改成繼續長粗長高，不會卡住）
  branchDepth: 3,         // 每根主枝再分岔幾層

  // 今天的球
  maxBallsShown: 48,      // 樹幹周圍最多同時顯示幾顆，太多會卡
  ballRadius: 0.17,

  textLimit: 60,          // 可以留的一小段文字，上限幾個字
};

// ============================================================
//  運氣小卡（主島上的小望遠鏡，每天抽一張）
//  加一張就多一張，不用改程式。同一天抽到的一定一樣。
// ============================================================

export const FORTUNE_CARDS = [
  { name: '順風', line: '今天適合把拖很久的那件事做完。', hue: 0x7fd1ae },
  { name: '慢板', line: '不用趕。慢慢來，今天反而會對。', hue: 0x9db8d8 },
  { name: '巧遇', line: '會遇到一個剛好需要的東西。', hue: 0xf7b955 },
  { name: '補眠', line: '今天的你需要休息，不是生產力。', hue: 0x8d8bc4 },
  { name: '靈光', line: '隨手記下冒出來的念頭，別讓它跑掉。', hue: 0xffd36e },
  { name: '回聲', line: '以前做的事今天會回來找你，好的那種。', hue: 0xc9a0dc },
  { name: '小贏', line: '不大，但確實是好事。', hue: 0xffc1d4 },
  { name: '換位', line: '換個角度看，卡住的地方就通了。', hue: 0x7ec4cf },
  { name: '清空', line: '丟掉一樣東西，今天會變輕。', hue: 0xb8c7a8 },
  { name: '鄰人', line: '主動跟某個人說一句話。', hue: 0xf5a3a3 },
  { name: '深水', line: '今天適合一個人待著，不用解釋。', hue: 0x6c8bb0 },
  { name: '起風', line: '有變化。順著走，不要硬擋。', hue: 0xa8d5ba },
];

// ============================================================
//  代表角色（進站時選一隻，不用註冊）
//  要加角色就加一筆。shape 決定長相，換成真模型後用 model 欄位。
// ============================================================

export const CHARACTERS = [
  { id: 'dumpling', name: '圓糰', shape: 'round', color: 0xf6d7b0, accent: 0xe08f6a },
  { id: 'ears',     name: '長耳', shape: 'ears',  color: 0xe8e2ea, accent: 0xd49ab4 },
  { id: 'blocky',   name: '方塊', shape: 'block', color: 0xa8c8e8, accent: 0x5f87b5 },
  { id: 'hat',      name: '尖帽', shape: 'hat',   color: 0xf3c9a0, accent: 0x7f6ab0 },
  { id: 'beak',     name: '小鳥', shape: 'bird',  color: 0xf5e9a8, accent: 0xe8933f },
  { id: 'ghost',    name: '飄飄', shape: 'ghost', color: 0xd8e4f0, accent: 0x8fa8c8 },
];

export const AVATAR = {
  speed: 2.6,            // 走多快（單位／秒）
  turnSpeed: 9,          // 轉身多快
  arriveAt: 0.12,        // 離目標多近算走到了
  scale: 0.52,           // 角色整體大小
  walkRadius: 8.3,       // 走動範圍（主島半徑 9，留一點邊不要掉下去）
  nameLimit: 8,          // 名字最多幾個字
};

// ============================================================
//  連線（非同步）
// ============================================================

export const NET = {
  // 'local'  = 同一台電腦的不同分頁互相看（預設，不用伺服器）
  //            想試：開兩個瀏覽器視窗連到同一個網址，就會看到兩隻角色
  // 'remote' = 真的連線，要填下面的 endpoint
  mode: 'local',
  endpoint: '',          // 例如 'https://你的網址/api'

  publishEvery: 1500,    // 多久送一次自己的位置（毫秒）
  peerTimeout: 30000,    // 多久沒消息就當這個人走了
  lerpSpeed: 3.2,        // 別人的角色補間移動的速度（越大越快跟上，太大會變成瞬移）

  chatShow: 8,           // 左下角同時顯示幾則
  chatLimit: 60,         // 一則最多幾個字
  chatFade: 25000,       // 幾毫秒後訊息淡掉
};

// ============================================================
//  房間的轉播
//  youtube 填影片網址或影片代號都可以，留空就顯示「今天沒有轉播」
// ============================================================

export const BROADCAST = {
  title: '鼠尼 DJ',
  youtube: 'https://www.youtube.com/watch?v=mzB3gD2ROhM',

  // 直接貼在房間螢幕模型上播的影片（自己的檔案，例如 'media/dj-loop.mp4'）
  // 填了之後，走進房間螢幕就一直在播，不用點。
  // 注意：YouTube 沒辦法這樣用，它只能用 iframe（點開那種）。
  screenVideo: null,

  // 點開播放器時，沒有 youtube 的話改播這支
  fallbackVideo: null,

  autoplay: true,        // 打開面板時自動播（瀏覽器通常會先靜音）
};

// ============================================================
//  滾輪縮放（對著游標指的地方拉近）
// ============================================================

export const ZOOM = {
  enabled: true,
  step: 0.14,        // 滾一格縮放多少
  max: 0.8,          // 最多拉近到剩原本距離的 20%
  smooth: 7.5,       // 鏡頭跟上的速度。太大會變成瞬間跳過去，沒有滑順感
};

// ============================================================
//  鑽石泡泡（隨機出現，點到就收集）
// ============================================================

export const GEMS = {
  enabled: true,
  maxAlive: 5,              // 畫面上最多同時幾顆
  spawnEvery: [3.5, 9],     // 隔幾秒冒一顆（在這個區間隨機）
  life: [9, 17],            // 一顆活幾秒才自己消失
  radius: 8.4,              // 出現的水平範圍
  height: [0.9, 4.4],       // 出現的高度範圍
  size: 0.27,
};

// ============================================================
//  天空與光（粉色夕陽）
//  顏色都在這裡改，改完存檔按 F5 就看得到
// ============================================================

export const SKY = {
  // 由上到下的漸層
  top:     '#4a3f73',    // 天頂，帶紫的夜藍
  mid:     '#e98fa6',    // 中段的粉
  horizon: '#ffc79b',    // 接近地平線的暖橘
  bottom:  '#7a4c68',    // 地平線以下，暗一點的玫瑰

  // 天空裡那顆太陽（反射也會吃到它）
  sunColor: '#ffe3b0',
  sunX: 0.68,            // 左右位置 0~1
  sunY: 0.66,            // 高度，0 是天頂、1 是最下面
  sunSize: 0.30,         // 光暈大小

  fog:     '#c2869e',    // 遠處的霧色
  fogNear: 36,
  fogFar:  78,

  exposure: 1.1,         // 整體亮度
};

export const LIGHTS = {
  sunColor: '#ffb98c',       // 主光（夕陽），偏橘粉
  sunIntensity: 2.9,
  sunPos: [-15, 7, -13],     // 島的後方＝逆光夕陽，海面才會有光路；壓低＝影子拉長

  fillColor: '#8f9ed8',      // 對向的補光，冷色才襯得出夕陽
  fillIntensity: 1.35,
  fillPos: [16, 10, 14],     // 鏡頭這一側，把逆光的暗面補起來

  skyColor: '#ffd3dc',       // 天空打下來的環境光
  groundColor: '#6b4a5a',    // 地面反上來的
  ambientIntensity: 0.85,
};

export const WATER = {
  // 海面的夕陽漸層：由遠（地平線）到近
  horizonColor: '#ffbe86',   // 最遠處，被夕陽燒亮的那一圈
  midColor:     '#d1769a',   // 中段的粉
  nearColor:    '#5e3f66',   // 離鏡頭最近，最深的紫

  roughness: 0.22,
  metalness: 0.35,
  opacity: 0.96,

  y: -11,                    // 海面高度。越高離島越近
  radius: 130,               // 要夠大才會延伸到地平線（遠處會被霧吃掉，形成海平線）

  // 夕陽在海上拉出來的那道光路
  sunPath: true,
  sunPathColor: '#ffcf9a',
  sunPathLength: 70,         // 光路多長
  sunPathWidth: 11,          // 多寬

  sunDisc: true,             // 海平線上那顆太陽
  sunDiscSize: 17,
  sunDiscDistance: 76,
  sunDiscY: 19,              // 太陽離海面多高。太低會被島擋在後面看不到
};

// 一開始進去哪個場景
export const START_SCENE = 'island';

// 回到外面的時候要去哪個場景
export const HOME_SCENE = 'island';


// ============================================================
//  Blender 命名規則 —— 你在 Blender 改物件名字，就等於改網頁行為
//  （不用來找我改程式）
// ============================================================
//
//   enter_dessert     點了會進入「甜點店」（enter_ 後面接上面的場景代號）
//   enter_room        點了會進入「房間」
//   hit_桌子           可以被點，點到會出現波紋記號
//   hover_看板         滑鼠移過去會亮起來
//   float_小島         會自己上下漂浮（整個群組一起飄）
//   flow_瀑布          貼圖會一直往下流（做瀑布、河流）
//   panel_tree         點了會跳出面板（例如神木的投球面板），不換場景
//   地板_nohit         射線直接穿過，完全不理它
//
//   物件名稱沒有上面任何前綴 → 只是風景，可以被點地面的波紋打到，但不會有特別反應
//
// ============================================================

export const NAMING = {
  enter: 'enter_',     // 點了會換場景
  hit:   'hit_',       // 可以被點（會出現波紋）
  hover: 'hover_',     // 滑鼠移過去會亮
  float: 'float_',     // 會自己上下漂浮
  flow:  'flow_',      // 貼圖會一直流動（瀑布、河）
  panel: 'panel_',     // 點了會跳出一個面板（不換場景）
  ignore: '_nohit',    // 結尾是這個 → 射線忽略
};
