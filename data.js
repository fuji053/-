/* =====================================================================
   数値ファイル（ここを変えると、ゲームの強さや動きが変わります）
   ---------------------------------------------------------------------
   ■ 技の数値の意味
     f    : 攻撃が当たるコマ [始まり, 終わり]（1秒 = 60コマ）
     x, y : 攻撃の位置。x = 前方向の距離、y = 足元からの高さ（単位はピクセル）
     r    : 攻撃の当たり判定の大きさ（半径）
     dmg  : ダメージ（％）
     ang  : 飛ばす角度（0 = 真横の前、45 = 斜め上、90 = 真上、180 = 後ろ、270 = 真下）
     bkb  : 基本の吹っ飛び（％が低くても必ず飛ぶ量）
     kbg  : 吹っ飛び率（％が増えるほど伸びる量。大きいほど高い％でよく飛ぶ）
     rehit: 同じ相手に何コマごとに再ヒットするか（連続ヒット技だけ）
   ■ 技全体の数値
     dur     : 技の長さ（コマ数）
     landLag : 空中技の途中で着地したときのスキ（コマ数）
     charge  : ボタンを押し続けてためる技 { f: ためるコマ, max: 最大ためコマ数, mul: 最大まで ためたときの倍率 }
     helpless: true = 技のあと、着地するまで何もできない（上必殺技など）
     counter : カウンター { f: 受け付けるコマ, mul: 受けたダメージの何倍で返すか, min: 最低ダメージ }
     reflect : 飛び道具を跳ね返す { f: 受け付けるコマ, mul: 跳ね返した弾の強さの倍率 }
   ■ キャラ全体の数値（stats）
     weight: 重さ（重いほど飛びにくい） / walk・run: 歩く・走る速さ / air: 空中の横移動の速さ
     jump・djump: ジャンプ・2段ジャンプの高さ / gravity: 落ちる速さ / fall: 最大落下速度
     dmgMul: 全技のダメージ倍率 / kbMul: 全技の吹っ飛ばし倍率 / speed: 技の速さ倍率（1.1 = 1割速い）
   ===================================================================== */

window.GAME_DATA = {

  /* ---------- 全体のルール・物理 ---------- */
  rules: {
    stocks: 3,              // ストック（残機）
    respawnInvincible: 150, // 復活したあとの無敵時間（コマ）
  },
  physics: {
    launchScale: 0.135,     // 吹っ飛びの強さ全体（大きいほど全員よく飛ぶ）
    kbDecay: 0.30,          // 吹っ飛んだ勢いが弱まる速さ
    hitstunMul: 0.40,       // 吹っ飛んでいる間、操作できない時間の長さ
    tumbleKb: 80,           // この値より強く飛ばされると、きりもみ状態になる
    hitlagBase: 3,          // 当たった瞬間に止まる「ヒットストップ」の基本コマ数
    hitlagMul: 0.38,        // ダメージに応じて増えるヒットストップ
    groundFriction: 0.7,    // 地上での止まりやすさ
    shieldMax: 50,          // シールドの耐久
    shieldDrain: 0.14,      // シールドを張っている間に減る量（1コマあたり）
    shieldRegen: 0.10,      // 張っていないときに回復する量
    shieldBreakStun: 200,   // シールドが割れたときの気絶コマ数
    grabHoldBase: 90,       // つかんでいられる時間（相手の％が高いほど長くなる）
  },
  stage: {
    name: '天空の舞台（仮）',
    halfWidth: 450,         // ステージの横幅の半分
    thickness: 70,          // ステージの厚み
    blast: { left: -1150, right: 1150, top: -950, bottom: 650 }, // 撃墜ライン
  },

  /* ---------- CPUの強さ ---------- */
  cpu: {
    reaction: 9,        // 判断の間隔（コマ）。小さいほど反応が速い
    aggression: 0.65,   // 攻めっ気（0〜1）
    shieldChance: 0.25, // 攻撃を見てシールドする確率
    mistake: 0.12,      // わざと様子見する確率
  },

  /* ---------- 画面ボタンの配置（右下の角からの距離、単位はピクセル） ---------- */
  controls: {
    stickZoneRatio: 0.45, // 画面の左からこの割合までが移動スティックの範囲
    stickRadius: 58,      // 移動スティックの大きさ
    buttons: {
      A:      { right: 110, bottom: 100, r: 36, label: 'A' },
      B:      { right: 190, bottom: 52,  r: 29, label: 'B' },
      jump:   { right: 44,  bottom: 172, r: 27, label: 'ジャンプ' },
      shield: { right: 135, bottom: 196, r: 26, label: 'シールド' },
      grab:   { right: 216, bottom: 148, r: 25, label: 'つかみ' },
    },
    cstick: { right: 42, bottom: 48, r: 32, label: 'C' },
  },

  /* =====================================================================
     武器ごとの共通技（A・空中攻撃・スマッシュ）
     同じ武器のキャラは同じ動きの形を使い、強さはキャラごとの倍率で変わります
     ===================================================================== */
  weapons: {

    /* ---------- 素手 ---------- */
    unarmed: {
      jab:   { name: '弱：ジャブ', dur: 18, poses: [[0,'punchWind'],[3,'punch'],[9,'punch'],[18,'idle']],
               hits: [{ f:[3,5], x:38, y:70, r:15, dmg:3.5, ang:40, bkb:25, kbg:25 }] },
      utilt: { name: '上強：アッパー', dur: 28, poses: [[0,'uppercutWind'],[6,'uppercut'],[16,'uppercut'],[28,'idle']],
               hits: [{ f:[6,10], x:18, y:105, r:20, dmg:8, ang:90, bkb:40, kbg:95 }] },
      ftilt: { name: '横強：前蹴り', dur: 30, poses: [[0,'kickWind'],[7,'kick'],[15,'kick'],[30,'idle']],
               hits: [{ f:[7,10], x:48, y:45, r:18, dmg:10, ang:38, bkb:30, kbg:90 }] },
      dtilt: { name: '下強：足払い', dur: 24, poses: [[0,'sweepWind'],[5,'sweep'],[12,'sweep'],[24,'idle']],
               hits: [{ f:[5,8], x:50, y:10, r:16, dmg:7, ang:75, bkb:35, kbg:55 }] },

      fsmash:{ name: '横スマ：渾身ストレート', dur: 52, charge: { f:9, max:60, mul:1.4 },
               poses: [[0,'smashFwdWind'],[9,'smashFwdWind'],[15,'smashFwd'],[28,'smashFwd'],[52,'idle']],
               events: [{ f:14, vx:3 }],
               hits: [{ f:[15,18], x:52, y:65, r:22, dmg:19, ang:38, bkb:40, kbg:98 }] },
      usmash:{ name: '上スマ：両腕突き上げ', dur: 52, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[14,'smashUp'],[26,'smashUp'],[52,'idle']],
               hits: [{ f:[14,18], x:8, y:118, r:26, dmg:17, ang:88, bkb:38, kbg:98 }] },
      dsmash:{ name: '下スマ：地面たたき', dur: 50, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'smashDownWind'],[10,'smashDownWind'],[16,'smashDown'],[30,'smashDown'],[50,'idle']],
               hits: [{ f:[16,19], x:42, y:12, r:22, dmg:16, ang:30, bkb:40, kbg:92 },
                      { f:[16,19], x:-42, y:12, r:22, dmg:16, ang:150, bkb:40, kbg:92 }] },

      nair:  { name: '空N：開脚キック', dur: 34, landLag: 8, poses: [[0,'fall'],[3,'nairSpread'],[24,'nairSpread'],[34,'fall']],
               hits: [{ f:[4,8], x:15, y:40, r:30, dmg:9, ang:45, bkb:25, kbg:80 },
                      { f:[9,22], x:15, y:40, r:26, dmg:5, ang:45, bkb:20, kbg:60 }] },
      fair:  { name: '空前：両拳たたきつけ', dur: 40, landLag: 16, poses: [[0,'overheadWind'],[11,'overheadWind'],[13,'overheadSlam'],[24,'overheadSlam'],[40,'fall']],
               hits: [{ f:[13,16], x:42, y:45, r:24, dmg:14, ang:45, bkb:35, kbg:92 }] },
      bair:  { name: '空後：後ろ蹴り', dur: 32, landLag: 10, poses: [[0,'fall'],[6,'backKick'],[16,'backKick'],[32,'fall']],
               hits: [{ f:[6,9], x:-50, y:42, r:20, dmg:13, ang:140, bkb:30, kbg:95 }] },
      uair:  { name: '空上：宙返り蹴り', dur: 30, landLag: 8, poses: [[0,'jump',{r:0}],[5,'upKick',{r:-40}],[14,'upKick',{r:-80}],[30,'fall',{r:-360}]],
               hits: [{ f:[5,9], x:0, y:105, r:24, dmg:10, ang:85, bkb:30, kbg:90 }] },
      dair:  { name: '空下：踏みつけ（メテオ）', dur: 40, landLag: 20, poses: [[0,'jump'],[10,'stomp'],[22,'stomp'],[40,'fall']],
               hits: [{ f:[10,14], x:4, y:-5, r:22, dmg:14, ang:270, bkb:20, kbg:85 }] },
    },

    /* ---------- ムチ ---------- */
    whip: {
      jab:   { name: '弱：ムチはじき', dur: 20, poses: [[0,'swingWind'],[5,'swingFwd'],[11,'swingFwd'],[20,'idle']],
               hits: [{ f:[5,7], x:62, y:62, r:15, dmg:3, ang:45, bkb:25, kbg:25 },
                      { f:[5,7], x:88, y:62, r:12, dmg:4, ang:45, bkb:25, kbg:25 }] },
      utilt: { name: '上強：頭上ムチ', dur: 30, poses: [[0,'swingUpWind'],[7,'swingUp'],[16,'swingUp'],[30,'idle']],
               hits: [{ f:[7,12], x:28, y:112, r:24, dmg:7, ang:88, bkb:35, kbg:90 }] },
      ftilt: { name: '横強：ムチ打ち', dur: 32, poses: [[0,'swingWind'],[9,'swingFwd'],[18,'swingFwd'],[32,'idle']],
               hits: [{ f:[9,11], x:122, y:58, r:13, dmg:11, ang:40, bkb:30, kbg:88 },
                      { f:[9,11], x:90, y:58, r:16, dmg:8, ang:40, bkb:30, kbg:80 }] },
      dtilt: { name: '下強：低空ムチ', dur: 24, poses: [[0,'swingLowWind'],[6,'swingLow'],[13,'swingLow'],[24,'idle']],
               hits: [{ f:[6,8], x:88, y:8, r:15, dmg:6, ang:20, bkb:30, kbg:60 }] },

      fsmash:{ name: '横スマ：大ムチ', dur: 54, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'swingWind'],[10,'swingWind'],[18,'swingFwd'],[30,'swingFwd'],[54,'idle']],
               hits: [{ f:[18,20], x:145, y:58, r:16, dmg:15, ang:38, bkb:38, kbg:105 },
                      { f:[18,20], x:95, y:58, r:18, dmg:12, ang:40, bkb:35, kbg:85 }] },
      usmash:{ name: '上スマ：頭上旋回', dur: 50, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[14,'swingUp'],[26,'swingUp'],[50,'idle']],
               hits: [{ f:[14,22], x:0, y:118, r:32, dmg:13, ang:90, bkb:40, kbg:95 },
                      { f:[14,16], x:22, y:55, r:24, dmg:9, ang:88, bkb:45, kbg:80 }] },
      dsmash:{ name: '下スマ：両側ムチ', dur: 50, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'swingLowWind'],[8,'swingLowWind'],[12,'swingLow'],[18,'swingLow',{r:0}],[22,'swingLow'],[50,'idle']],
               events: [{ f:17, turn:true }, { f:30, turn:true }],
               hits: [{ f:[12,14], x:85, y:8, r:18, dmg:12, ang:25, bkb:35, kbg:90 },
                      { f:[20,22], x:85, y:8, r:18, dmg:12, ang:25, bkb:35, kbg:90 }] },

      nair:  { name: '空N：回転ムチ', dur: 36, landLag: 10, poses: [[0,'fall',{r:0}],[6,'swingFwd',{r:0}],[24,'swingFwd',{r:-720}],[36,'fall',{r:-720}]],
               hits: [{ f:[6,21], x:55, y:45, r:26, dmg:2.5, ang:70, bkb:12, kbg:15, rehit:5 },
                      { f:[6,21], x:-55, y:45, r:26, dmg:2.5, ang:110, bkb:12, kbg:15, rehit:5 },
                      { f:[22,24], x:0, y:45, r:60, dmg:5, ang:45, bkb:40, kbg:85 }] },
      fair:  { name: '空前：前ムチ', dur: 32, landLag: 9, poses: [[0,'swingWind'],[9,'swingFwd'],[18,'swingFwd'],[32,'fall']],
               hits: [{ f:[9,12], x:92, y:48, r:17, dmg:9, ang:40, bkb:30, kbg:85 }] },
      bair:  { name: '空後：後ろムチ', dur: 34, landLag: 10, poses: [[0,'fall'],[8,'aimBack'],[18,'aimBack'],[34,'fall']],
               hits: [{ f:[8,11], x:-95, y:50, r:17, dmg:10, ang:140, bkb:30, kbg:90 }] },
      uair:  { name: '空上：真上ムチ', dur: 30, landLag: 8, poses: [[0,'fall'],[8,'swingUp'],[16,'swingUp'],[30,'fall']],
               hits: [{ f:[8,12], x:10, y:125, r:18, dmg:8, ang:88, bkb:30, kbg:90 }] },
      dair:  { name: '空下：真下ムチ（メテオ）', dur: 36, landLag: 14, poses: [[0,'fall'],[10,'swingDown'],[20,'swingDown'],[36,'fall']],
               hits: [{ f:[10,13], x:0, y:-60, r:17, dmg:10, ang:275, bkb:20, kbg:70 }] },
    },

    /* ---------- 弓 ---------- */
    bow: {
      jab:   { name: '弱：弓で突く', dur: 18, poses: [[0,'guardWind'],[4,'guard'],[10,'guard'],[18,'idle']],
               hits: [{ f:[4,6], x:42, y:62, r:16, dmg:4, ang:40, bkb:25, kbg:25 }] },
      utilt: { name: '上強：弓で頭上はらい', dur: 28, poses: [[0,'swingUpWind'],[6,'swingUp'],[15,'swingUp'],[28,'idle']],
               hits: [{ f:[6,11], x:22, y:102, r:22, dmg:7, ang:90, bkb:40, kbg:90 }] },
      ftilt: { name: '横強：前蹴り', dur: 30, poses: [[0,'kickWind'],[7,'kick'],[15,'kick'],[30,'idle']],
               hits: [{ f:[7,10], x:50, y:45, r:18, dmg:9, ang:40, bkb:30, kbg:88 }] },
      dtilt: { name: '下強：弓で足元はらい', dur: 22, poses: [[0,'swingLowWind'],[5,'swingLow'],[12,'swingLow'],[22,'idle']],
               hits: [{ f:[5,8], x:55, y:10, r:16, dmg:6, ang:75, bkb:35, kbg:55 }] },

      fsmash:{ name: '横スマ：弓フルスイング', dur: 50, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'swingWind'],[8,'swingWind'],[14,'swingFwd'],[26,'swingFwd'],[50,'idle']],
               hits: [{ f:[14,17], x:58, y:62, r:24, dmg:16, ang:38, bkb:38, kbg:96 }] },
      usmash:{ name: '上スマ：真上撃ち', dur: 48, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'aimUp'],[8,'aimUp'],[13,'releaseUp'],[28,'releaseUp'],[48,'idle']],
               hits: [{ f:[12,16], x:0, y:110, r:24, dmg:15, ang:90, bkb:38, kbg:96 },
                      { f:[12,14], x:22, y:55, r:22, dmg:10, ang:88, bkb:45, kbg:80 }],
               events: [{ f:13, proj:'arrow', ang:90, x:0, y:95, speed:17, dmg:6, kang:90, bkb:25, kbg:50 }] },
      dsmash:{ name: '下スマ：弓で回転はらい', dur: 48, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'swingLowWind'],[8,'swingLowWind'],[12,'swingLow',{r:0}],[20,'swingLow',{r:0}],[48,'idle']],
               hits: [{ f:[12,15], x:52, y:10, r:22, dmg:13, ang:30, bkb:38, kbg:90 },
                      { f:[12,15], x:-52, y:10, r:22, dmg:13, ang:150, bkb:38, kbg:90 }] },

      nair:  { name: '空N：回転キック', dur: 32, landLag: 8, poses: [[0,'fall',{r:0}],[5,'nairSpread',{r:0}],[18,'nairSpread',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[5,9], x:0, y:40, r:34, dmg:8, ang:45, bkb:25, kbg:80 },
                      { f:[10,18], x:0, y:40, r:30, dmg:5, ang:45, bkb:20, kbg:60 }] },
      fair:  { name: '空前：弓ふり下ろし', dur: 32, landLag: 10, poses: [[0,'swingWind'],[8,'swingFwd'],[16,'swingFwd'],[32,'fall']],
               hits: [{ f:[8,11], x:52, y:50, r:20, dmg:10, ang:45, bkb:30, kbg:85 }] },
      bair:  { name: '空後：後ろ蹴り', dur: 32, landLag: 10, poses: [[0,'fall'],[6,'backKick'],[16,'backKick'],[32,'fall']],
               hits: [{ f:[6,9], x:-48, y:42, r:19, dmg:11, ang:140, bkb:30, kbg:92 }] },
      uair:  { name: '空上：弓で頭上はらい', dur: 30, landLag: 8, poses: [[0,'fall'],[6,'swingUp'],[14,'swingUp'],[30,'fall']],
               hits: [{ f:[6,10], x:5, y:102, r:24, dmg:9, ang:88, bkb:30, kbg:90 }] },
      dair:  { name: '空下：踏みつけ（メテオ）', dur: 38, landLag: 16, poses: [[0,'jump'],[10,'stomp'],[20,'stomp'],[38,'fall']],
               hits: [{ f:[10,13], x:4, y:-5, r:20, dmg:11, ang:280, bkb:25, kbg:75 }] },
    },

    /* ---------- 鏡の盾 ---------- */
    mirror: {
      jab:   { name: '弱：盾で押す', dur: 18, poses: [[0,'guardWind'],[4,'bash'],[10,'bash'],[18,'idle']],
               hits: [{ f:[4,6], x:40, y:60, r:18, dmg:4, ang:40, bkb:30, kbg:25 }] },
      utilt: { name: '上強：盾つき上げ', dur: 28, poses: [[0,'guardDown'],[6,'guardUp'],[15,'guardUp'],[28,'idle']],
               hits: [{ f:[6,11], x:15, y:108, r:24, dmg:8, ang:90, bkb:40, kbg:90 }] },
      ftilt: { name: '横強：盾ぶつけ', dur: 30, poses: [[0,'guardWind'],[7,'bash'],[15,'bash'],[30,'idle']],
               events: [{ f:6, vx:3 }],
               hits: [{ f:[7,10], x:48, y:58, r:22, dmg:9, ang:35, bkb:40, kbg:85 }] },
      dtilt: { name: '下強：盾すべり', dur: 24, poses: [[0,'crouch'],[6,'guardLow'],[13,'guardLow'],[24,'idle']],
               hits: [{ f:[6,9], x:50, y:12, r:18, dmg:7, ang:75, bkb:35, kbg:55 }] },

      fsmash:{ name: '横スマ：盾タックル', dur: 52, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'guardWind'],[10,'guardWind'],[15,'bash'],[28,'bash'],[52,'idle']],
               events: [{ f:14, vx:5 }],
               hits: [{ f:[15,18], x:55, y:58, r:26, dmg:17, ang:38, bkb:40, kbg:96 }] },
      usmash:{ name: '上スマ：盾かち上げ', dur: 50, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[13,'guardUp'],[26,'guardUp'],[50,'idle']],
               hits: [{ f:[13,18], x:0, y:118, r:28, dmg:15, ang:88, bkb:40, kbg:96 },
                      { f:[13,15], x:22, y:55, r:24, dmg:10, ang:88, bkb:45, kbg:80 }] },
      dsmash:{ name: '下スマ：盾たたきつけ', dur: 50, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'smashDownWind'],[10,'smashDownWind'],[14,'guardLow'],[30,'guardLow'],[50,'idle']],
               hits: [{ f:[14,17], x:45, y:10, r:22, dmg:14, ang:35, bkb:40, kbg:90 },
                      { f:[14,17], x:-45, y:10, r:22, dmg:14, ang:145, bkb:40, kbg:90 }] },

      nair:  { name: '空N：盾回転', dur: 32, landLag: 9, poses: [[0,'fall',{r:0}],[5,'guard',{r:0}],[16,'guard',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[5,9], x:0, y:45, r:36, dmg:9, ang:45, bkb:25, kbg:80 },
                      { f:[10,16], x:0, y:45, r:32, dmg:5, ang:45, bkb:20, kbg:60 }] },
      fair:  { name: '空前：盾はらい', dur: 34, landLag: 12, poses: [[0,'guardWind'],[9,'bash'],[18,'bash'],[34,'fall']],
               hits: [{ f:[9,12], x:48, y:50, r:22, dmg:11, ang:45, bkb:32, kbg:88 }] },
      bair:  { name: '空後：後ろ蹴り', dur: 32, landLag: 10, poses: [[0,'fall'],[6,'backKick'],[16,'backKick'],[32,'fall']],
               hits: [{ f:[6,9], x:-48, y:42, r:19, dmg:12, ang:140, bkb:30, kbg:92 }] },
      uair:  { name: '空上：盾つき上げ', dur: 30, landLag: 8, poses: [[0,'fall'],[6,'guardUp'],[14,'guardUp'],[30,'fall']],
               hits: [{ f:[6,10], x:0, y:108, r:26, dmg:10, ang:88, bkb:30, kbg:90 }] },
      dair:  { name: '空下：盾落とし（メテオ）', dur: 38, landLag: 16, poses: [[0,'jump'],[10,'guardDownAir'],[20,'guardDownAir'],[38,'fall']],
               hits: [{ f:[10,14], x:0, y:-8, r:22, dmg:12, ang:275, bkb:25, kbg:75 }] },
    },
  },

  /* ---------- つかみ・投げ（全キャラ共通。キャラごとに変えたい場合は overrides で） ---------- */
  throws: {
    grab:   { name: 'つかみ', dur: 30, poses: [[0,'idle'],[6,'grab'],[14,'grab'],[30,'idle']],
              hits: [{ f:[6,9], x:40, y:55, r:20, grab:true }] },
    fthrow: { name: '前投げ', dur: 26, release: 10, poses: [[0,'hold'],[8,'throwFwd'],[26,'idle']],
              held: [[0,36,0],[8,48,10]], hit: { dmg:8, ang:40, bkb:55, kbg:60 } },
    bthrow: { name: '後ろ投げ', dur: 32, release: 12, poses: [[0,'hold'],[10,'throwFwd'],[32,'idle']],
              events: [{ f:0, turn:true }],
              held: [[0,-36,0],[6,-10,40],[11,44,15]], hit: { dmg:10, ang:42, bkb:60, kbg:70 } },
    uthrow: { name: '上投げ', dur: 30, release: 12, poses: [[0,'hold'],[11,'throwUp'],[30,'idle']],
              held: [[0,36,0],[11,5,105]], hit: { dmg:7, ang:90, bkb:65, kbg:70 } },
    dthrow: { name: '下投げ', dur: 32, release: 13, poses: [[0,'hold'],[12,'throwDown'],[32,'idle']],
              held: [[0,36,0],[12,34,-2]], hit: { dmg:6, ang:80, bkb:55, kbg:35 } },
  },

  /* =====================================================================
     キャラクター（今は代表の4体）
     specials: B（必殺技）。地上4種 + 空中5種 = 9種、すべて別の技
     overrides: 共通技をこのキャラだけ変えたいときに使う
       例）overrides: { jab: { hits: [{ dmg: 5 }] } } … このキャラの弱攻撃だけダメージ5に
     ===================================================================== */
  characters: [

    /* ===== 1：拳闘士（近距離・パワー・素手） ===== */
    {
      id: 'fist', no: 1, name: '拳闘士', range: '近距離', type: 'パワー', weapon: 'unarmed',
      stats: { weight: 116, walk: 3.0, run: 5.4, air: 3.5, airAccel: 0.35, jump: 14.5, djump: 13.5,
               gravity: 0.62, fall: 10.5, airJumps: 1, dmgMul: 1.15, kbMul: 1.0, speed: 0.92 },
      look: { thick: 7.5, head: 11 },
      cpu: { style: 'rush', range: 55 },
      specials: {
        /* --- 地上 --- */
        n:    { name: 'NB：ためパンチ', dur: 50, charge: { f:10, max:90, mul:2.0 },
                poses: [[0,'punchWind'],[10,'smashFwdWind'],[17,'punch'],[30,'punch'],[50,'idle']],
                events: [{ f:16, vx:7 }],
                hits: [{ f:[17,20], x:52, y:68, r:24, dmg:12, ang:40, bkb:40, kbg:85 }] },
        side: { name: '横B：ラリアット', dur: 48,
                poses: [[0,'punchWind'],[8,'lariat',{r:0}],[26,'lariat',{r:0}],[48,'idle']],
                events: [{ f:[8,26], vx:8.5 }],
                hits: [{ f:[8,26], x:28, y:70, r:24, dmg:11, ang:45, bkb:45, kbg:75 }] },
        up:   { name: '上B：昇竜アッパー', dur: 46, helpless: true, landLag: 20, gravityMul: 0,
                poses: [[0,'uppercutWind'],[4,'uppercut'],[24,'uppercut'],[46,'helpless']],
                events: [{ f:[4,22], vy:12.5, vx:2.5 }, { f:23, vy:2 }],
                gravityFrames: [0,23],
                hits: [{ f:[4,8], x:22, y:75, r:24, dmg:13, ang:80, bkb:50, kbg:80 },
                       { f:[9,20], x:10, y:100, r:18, dmg:5, ang:85, bkb:30, kbg:50 }] },
        down: { name: '下B：地割れ', dur: 50,
                poses: [[0,'smashDownWind'],[14,'smashDown'],[34,'smashDown'],[50,'idle']],
                events: [{ f:15, proj:'shock', dir:1 }, { f:15, proj:'shock', dir:-1 }],
                hits: [{ f:[14,17], x:30, y:12, r:26, dmg:10, ang:80, bkb:50, kbg:60 }] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中ためパンチ', dur: 46, charge: { f:10, max:45, mul:1.6 }, landLag: 14,
                gravityMul: 0.3,
                poses: [[0,'punchWind'],[10,'smashFwdWind'],[16,'punch'],[28,'punch'],[46,'fall']],
                hits: [{ f:[16,19], x:50, y:62, r:24, dmg:11, ang:40, bkb:40, kbg:85 }] },
        airF: { name: '空中前B：ダイブラリアット', dur: 44, landLag: 14, oncePerAir: true, gravityMul: 0.15,
                poses: [[0,'punchWind'],[6,'lariat'],[24,'lariat'],[44,'fall']],
                events: [{ f:0, vy:-1 }, { f:[6,24], vx:10 }],
                hits: [{ f:[6,24], x:30, y:58, r:24, dmg:11, ang:45, bkb:40, kbg:75 }] },
        airB: { name: '空中後B：バックナックル', dur: 40, landLag: 14,
                poses: [[0,'punchWind'],[10,'punch'],[22,'punch'],[40,'fall']],
                events: [{ f:3, turn:true }],
                hits: [{ f:[10,13], x:48, y:60, r:22, dmg:15, ang:40, bkb:40, kbg:92 }] },
        airU: { name: '空中上B：昇竜アッパー（空）', dur: 46, helpless: true, landLag: 20,
                poses: [[0,'uppercutWind'],[4,'uppercut'],[24,'uppercut'],[46,'helpless']],
                events: [{ f:[4,22], vy:14, vx:3.5 }, { f:23, vy:2 }],
                gravityFrames: [0,23],
                hits: [{ f:[4,8], x:22, y:75, r:24, dmg:12, ang:80, bkb:50, kbg:80 },
                       { f:[9,20], x:10, y:100, r:18, dmg:5, ang:85, bkb:30, kbg:50 }] },
        airD: { name: '空中下B：メテオダイブ', dur: 70, landLag: 26, helpless: true,
                poses: [[0,'jump'],[8,'stomp'],[70,'stomp']],
                events: [{ f:0, vy:5 }, { f:[9,69], vy:-17, vx:0 }],
                gravityFrames: [0,70],
                landSpawn: [{ proj:'shock', dir:1 }, { proj:'shock', dir:-1 }],
                hits: [{ f:[9,69], x:0, y:20, r:24, dmg:12, ang:270, bkb:30, kbg:70 }] },
      },
      projectiles: {
        shock: { type:'shock', speed:7, life:32, r:16, dmg:8, ang:70, bkb:40, kbg:60 },
      },
      overrides: {},
    },

    /* ===== 7：ムチ使い（中距離・スピード・ムチ） ===== */
    {
      id: 'whip', no: 7, name: 'ムチ使い', range: '中距離', type: 'スピード', weapon: 'whip',
      stats: { weight: 82, walk: 4.0, run: 7.8, air: 4.6, airAccel: 0.5, jump: 15.5, djump: 14.5,
               gravity: 0.58, fall: 10, airJumps: 1, dmgMul: 0.88, kbMul: 0.95, speed: 1.12 },
      look: { thick: 5.5, head: 10 },
      cpu: { style: 'mid', range: 110 },
      specials: {
        n:    { name: 'NB：ムチ連打（押し続けると続く）', dur: 32, loop: { from:6, to:20, max:6 },
                poses: [[0,'swingWind'],[6,'swingFwd'],[11,'swingWind'],[14,'swingFwd'],[20,'swingWind'],[24,'swingFwd'],[32,'idle']],
                hits: [{ f:[6,8], x:78, y:62, r:20, dmg:2, ang:80, bkb:18, kbg:5 },
                       { f:[14,16], x:78, y:45, r:20, dmg:2, ang:80, bkb:18, kbg:5 },
                       { f:[24,26], x:85, y:55, r:24, dmg:5, ang:40, bkb:45, kbg:70 }] },
        side: { name: '横B：ムチ引き寄せ', dur: 44,
                poses: [[0,'swingWind'],[10,'swingFwd'],[24,'pull'],[44,'idle']],
                hits: [{ f:[10,13], x:135, y:58, r:18, dmg:4, pull:true }] },
        up:   { name: '上B：ムチ上昇', dur: 40, helpless: true, landLag: 18,
                poses: [[0,'swingUpWind'],[5,'swingUp'],[20,'swingUp'],[40,'helpless']],
                events: [{ f:[5,20], vy:13.5, vx:1.5 }],
                gravityFrames: [0,21],
                hits: [{ f:[5,18], x:10, y:112, r:24, dmg:7, ang:85, bkb:40, kbg:70 }] },
        down: { name: '下B：両側足払い', dur: 36,
                poses: [[0,'swingLowWind'],[8,'swingLow',{r:0}],[20,'swingLow'],[36,'idle']],
                hits: [{ f:[8,10], x:72, y:8, r:20, dmg:7, ang:80, bkb:50, kbg:40 },
                       { f:[8,10], x:-72, y:8, r:20, dmg:7, ang:100, bkb:50, kbg:40 }] },
        airN: { name: '空中NB：旋回ムチ', dur: 44, landLag: 12, gravityMul: 0.25,
                poses: [[0,'fall',{r:0}],[6,'swingFwd',{r:0}],[32,'swingFwd',{r:-1080}],[44,'fall',{r:-1080}]],
                events: [{ f:0, vy:2.5 }],
                hits: [{ f:[6,31], x:60, y:45, r:28, dmg:2.5, ang:75, bkb:15, kbg:10, rehit:5 },
                       { f:[6,31], x:-60, y:45, r:28, dmg:2.5, ang:105, bkb:15, kbg:10, rehit:5 },
                       { f:[33,35], x:0, y:45, r:65, dmg:5, ang:45, bkb:45, kbg:80 }] },
        airF: { name: '空中前B：飛びつきムチ', dur: 40, landLag: 12, oncePerAir: true, gravityMul: 0.2,
                poses: [[0,'swingWind'],[6,'swingFwd'],[20,'swingFwd'],[40,'fall']],
                events: [{ f:0, vy:1 }, { f:[4,20], vx:11 }],
                hits: [{ f:[6,20], x:55, y:48, r:22, dmg:8, ang:45, bkb:35, kbg:70 }] },
        airB: { name: '空中後B：バックラッシュ', dur: 38, landLag: 12,
                poses: [[0,'swingWind'],[12,'swingFwd'],[22,'swingFwd'],[38,'fall']],
                events: [{ f:2, turn:true }],
                hits: [{ f:[12,14], x:112, y:52, r:18, dmg:13, ang:40, bkb:35, kbg:95 }] },
        airU: { name: '空中上B：ムチ旋回上昇', dur: 42, helpless: true, landLag: 18,
                poses: [[0,'fall',{r:0}],[4,'swingUp',{r:0}],[24,'swingUp',{r:-720}],[42,'helpless',{r:-720}]],
                events: [{ f:[4,24], vy:15 }],
                gravityFrames: [0,25],
                hits: [{ f:[4,22], x:0, y:70, r:34, dmg:3, ang:88, bkb:30, kbg:30, rehit:6 }] },
        airD: { name: '空中下B：真下ムチ', dur: 36, landLag: 14, gravityMul: 0.4,
                poses: [[0,'fall'],[10,'swingDown'],[20,'swingDown'],[36,'fall']],
                events: [{ f:0, vy:3 }],
                hits: [{ f:[10,12], x:0, y:-115, r:16, dmg:12, ang:270, bkb:30, kbg:80 },
                       { f:[10,12], x:0, y:-62, r:16, dmg:6, ang:60, bkb:30, kbg:50 }] },
      },
      projectiles: {},
      overrides: {},
    },

    /* ===== 14：弓使い（遠距離・バランス・弓） ===== */
    {
      id: 'bow', no: 14, name: '弓使い', range: '遠距離', type: 'バランス', weapon: 'bow',
      stats: { weight: 95, walk: 3.4, run: 6.0, air: 3.8, airAccel: 0.4, jump: 15, djump: 14,
               gravity: 0.55, fall: 9.5, airJumps: 1, dmgMul: 1.0, kbMul: 1.0, speed: 1.0 },
      look: { thick: 6, head: 10 },
      cpu: { style: 'zone', range: 330 },
      specials: {
        n:    { name: 'NB：ため撃ち', dur: 36, charge: { f:8, max:60, mul:2.2 },
                poses: [[0,'aim'],[8,'aim'],[12,'release'],[36,'idle']],
                events: [{ f:12, proj:'arrow', ang:0, x:30, y:68 }] },
        side: { name: '横B：三本矢', dur: 40,
                poses: [[0,'aim'],[10,'aim'],[13,'release'],[40,'idle']],
                events: [{ f:13, proj:'arrow', ang:0, x:30, y:68, dmg:4, speed:14 },
                         { f:13, proj:'arrow', ang:12, x:30, y:68, dmg:4, speed:14 },
                         { f:13, proj:'arrow', ang:-12, x:30, y:68, dmg:4, speed:14 }] },
        up:   { name: '上B：反動ジャンプ矢', dur: 44, helpless: true, landLag: 18,
                poses: [[0,'aimDown'],[8,'releaseDown'],[22,'jump'],[44,'helpless']],
                events: [{ f:8, proj:'arrow', ang:-90, x:0, y:25, speed:18, dmg:6 }, { f:[8,22], vy:15.5, vx:1.5 }],
                gravityFrames: [0,23] },
        down: { name: '下B：バックステップ射撃', dur: 38,
                poses: [[0,'crouch'],[4,'aim'],[12,'release'],[38,'idle']],
                events: [{ f:3, vy:6 }, { f:[3,11], vx:-7 }, { f:12, proj:'arrow', ang:0, x:30, y:68, dmg:6 }] },
        airN: { name: '空中NB：空中ため撃ち', dur: 34, charge: { f:8, max:40, mul:1.8 }, landLag: 10, gravityMul: 0.3,
                poses: [[0,'aim'],[8,'aim'],[12,'release'],[34,'fall']],
                events: [{ f:12, proj:'arrow', ang:0, x:30, y:68 }] },
        airF: { name: '空中前B：急降下射撃', dur: 34, landLag: 10,
                poses: [[0,'aimDiag'],[10,'releaseDiag'],[34,'fall']],
                events: [{ f:10, proj:'arrow', ang:-40, x:28, y:45, speed:17, dmg:7, kang:50 }, { f:10, vx:-3, vy:4 }] },
        airB: { name: '空中後B：振り向き撃ち', dur: 36, landLag: 10,
                poses: [[0,'aim'],[12,'release'],[36,'fall']],
                events: [{ f:2, turn:true }, { f:12, proj:'arrow', ang:0, x:30, y:68, dmg:7 }, { f:12, vx:-6 }] },
        airU: { name: '空中上B：反動ジャンプ矢（空）', dur: 44, helpless: true, landLag: 18,
                poses: [[0,'aimDown'],[8,'releaseDown'],[22,'jump'],[44,'helpless']],
                events: [{ f:8, proj:'arrow', ang:-90, x:0, y:25, speed:18, dmg:6 }, { f:[8,22], vy:16, vx:1.5 }],
                gravityFrames: [0,23] },
        airD: { name: '空中下B：矢の雨', dur: 38, landLag: 12,
                poses: [[0,'aimDown'],[12,'releaseDown'],[38,'fall']],
                events: [{ f:12, proj:'arrow', ang:-70, x:10, y:30, speed:15, dmg:5 },
                         { f:12, proj:'arrow', ang:-90, x:0, y:30, speed:15, dmg:5 },
                         { f:12, proj:'arrow', ang:-110, x:-10, y:30, speed:15, dmg:5 },
                         { f:12, vy:7 }] },
      },
      projectiles: {
        arrow: { type:'arrow', speed:16, grav:0.08, life:75, r:9, dmg:5, ang:40, bkb:22, kbg:50 },
      },
      overrides: {},
    },

    /* ===== 16：鏡盾使い（特殊・鏡の盾） ===== */
    {
      id: 'mirror', no: 16, name: '鏡盾使い', range: '特殊', type: '特殊', weapon: 'mirror',
      stats: { weight: 104, walk: 3.2, run: 5.6, air: 3.5, airAccel: 0.38, jump: 14.5, djump: 13.5,
               gravity: 0.6, fall: 10, airJumps: 1, dmgMul: 1.0, kbMul: 1.0, speed: 0.96 },
      look: { thick: 6.5, head: 10.5 },
      cpu: { style: 'counter', range: 70 },
      specials: {
        n:    { name: 'NB：反射の構え', dur: 36, reflect: { f:[4,26], x:30, y:55, r:55, mul:1.5 },
                poses: [[0,'guardWind'],[4,'guard'],[26,'guard'],[36,'idle']],
                hits: [{ f:[4,6], x:28, y:55, r:30, dmg:4, ang:45, bkb:45, kbg:30 }] },
        side: { name: '横B：シールドバッシュ', dur: 46, reflect: { f:[8,24], x:30, y:55, r:45, mul:1.3 },
                poses: [[0,'guardWind'],[8,'bash'],[24,'bash'],[46,'idle']],
                events: [{ f:[8,24], vx:9 }],
                hits: [{ f:[8,24], x:35, y:55, r:24, dmg:10, ang:40, bkb:45, kbg:75 }] },
        up:   { name: '上B：天鏡', dur: 44, helpless: true, landLag: 18, reflect: { f:[5,20], x:0, y:105, r:42, mul:1.3 },
                poses: [[0,'guardDown'],[5,'guardUp'],[22,'guardUp'],[44,'helpless']],
                events: [{ f:[5,21], vy:13.5, vx:1.5 }],
                gravityFrames: [0,22],
                hits: [{ f:[5,20], x:0, y:100, r:28, dmg:9, ang:88, bkb:45, kbg:70 }] },
        down: { name: '下B：カウンター', dur: 50,
                counter: { f:[4,26], mul:1.3, min:8, ang:40, bkb:45, kbg:80 },
                poses: [[0,'counter'],[26,'counter'],[50,'idle']] },
        airN: { name: '空中NB：空中反射', dur: 36, landLag: 10, gravityMul: 0.2, reflect: { f:[4,26], x:30, y:55, r:55, mul:1.5 },
                poses: [[0,'guardWind'],[4,'guard'],[26,'guard'],[36,'fall']],
                events: [{ f:0, vy:2 }] },
        airF: { name: '空中前B：鏡ブーメラン', dur: 36, landLag: 10,
                poses: [[0,'guardWind'],[12,'bash'],[36,'fall']],
                events: [{ f:12, proj:'disc', ang:0, x:30, y:58 }] },
        airB: { name: '空中後B：振り向き反射', dur: 38, landLag: 12, reflect: { f:[4,24], x:30, y:55, r:50, mul:1.4 },
                poses: [[0,'guardWind'],[6,'bash'],[24,'bash'],[38,'fall']],
                events: [{ f:2, turn:true }],
                hits: [{ f:[6,9], x:38, y:55, r:26, dmg:9, ang:40, bkb:40, kbg:80 }] },
        airU: { name: '空中上B：天鏡（空）', dur: 44, helpless: true, landLag: 18, reflect: { f:[5,20], x:0, y:105, r:42, mul:1.3 },
                poses: [[0,'guardDown'],[5,'guardUp'],[22,'guardUp'],[44,'helpless']],
                events: [{ f:[5,21], vy:15, vx:1.5 }],
                gravityFrames: [0,22],
                hits: [{ f:[5,20], x:0, y:100, r:28, dmg:9, ang:88, bkb:45, kbg:70 }] },
        airD: { name: '空中下B：空中カウンター', dur: 48, landLag: 12, gravityMul: 0.3,
                counter: { f:[4,26], mul:1.3, min:8, ang:40, bkb:45, kbg:80 },
                poses: [[0,'counter'],[26,'counter'],[48,'fall']] },
      },
      projectiles: {
        disc: { type:'disc', speed:13, decel:0.42, life:110, r:15, dmg:6, ang:50, bkb:30, kbg:50, max:1 },
      },
      overrides: {},
    },
  ],
};
