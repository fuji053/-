/* =====================================================================
   数値ファイル（ここを変えると、ゲームの強さや動きが変わります）
   ---------------------------------------------------------------------
   ■ 1つの攻撃（hits の中）の数値
     f    : 攻撃が当たるコマ [始まり, 終わり]（1秒 = 60コマ）
     x, y : 攻撃の位置。x = 前方向の距離、y = 足元からの高さ（ピクセル）
     r    : 当たり判定の大きさ（半径）
     dmg  : ダメージ（％）
     ang  : 飛ばす角度（0 = 前、45 = 斜め上、90 = 真上、180 = 後ろ、270 = 真下）
     bkb  : 基本の吹っ飛び（％が低くても必ず飛ぶ量）
     kbg  : 吹っ飛び率（％が増えるほど伸びる量）
     fkb  : 固定吹っ飛び（書いた場合は％に関係なく、いつも同じだけ飛ぶ。弱1・弱2など）
     react: くらった相手の反応　'light' = 小さくのけぞる / 'down' = 倒れる（ダウン）
            書かなければ自動（弱い吹っ飛び = のけぞり、強い吹っ飛び = きりもみで吹っ飛ぶ）
     rehit: 同じ相手に何コマごとに再ヒットするか（連続ヒット技だけ）
   ■ 技全体の数値
     dur     : 技の長さ（コマ数）。長いほどスキが大きい
     iasa    : このコマ以降は、次の行動で技を中断できる（本家の「スキの終わり」）
     next    : 弱1→弱2のような連続技 { key: 次の技, f: [Aを受け付ける始まり, 終わり] }
     landLag : 空中技の途中で着地したときのスキ（コマ数）
     charge  : Cスティックを倒し続けてためる（スマッシュだけ）{ f: ためるコマ, max: 最大コマ数, mul: 最大倍率 }
     armor   : このコマの間は攻撃を受けてもひるまない（アーマー）[始まり, 終わり]
     invuln  : このコマの間は無敵 [始まり, 終わり]
     helpless: true = 技のあと、着地するか崖をつかむまで何もできない（上必殺技など）
     counter : カウンター { f: 受け付けるコマ, mul: 受けたダメージの何倍で返すか, min: 最低ダメージ }
     reflect : 飛び道具を跳ね返す { f: 受け付けるコマ, mul: 跳ね返した弾の強さの倍率 }
     holdShot: Bを押している間ためて、離すと発射（遠距離タイプのNBだけ）
               { f: ためるコマ, max: 最大までのコマ数, min: ためなしの強さ, max2: 最大ためた強さ }
     cgrab   : 必殺技のつかみ。当たると extraMoves の技（つかんだ後の動き）に進む。シールドは効かない
     held    : 投げ・つかみ中の相手の位置 [コマ, 前, 上, 回転]
   ■ メテオ
     ang が 240〜300（真下向き）の攻撃が空中の相手に当たると「メテオ」になり、真下にたたき落とします
   ■ キャラ全体の数値（stats）
     weight: 重さ（重いほど飛びにくい） / walk・run: 歩く・走る速さ / air: 空中の横移動の速さ
     jump・djump: ジャンプ・2段ジャンプの強さ / gravity: 落ちる加速 / fall: 落下の最高速度
     dmgMul: 全技のダメージ倍率 / kbMul: 全技の吹っ飛ばし倍率 / speed: 技の速さ倍率（1.1 = 1割速い）
   ===================================================================== */

window.GAME_DATA = {

  /* ---------- 全体のルール ---------- */
  rules: {
    stocks: 3,              // ストック（残機）
    respawnInvincible: 150, // 復活したあとの無敵時間（コマ）
  },

  /* ---------- 物理・システム ---------- */
  physics: {
    launchScale: 0.135,     // 吹っ飛びの強さ全体（大きいほど全員よく飛ぶ）
    kbDecay: 0.30,          // 吹っ飛んだ勢いが弱まる速さ
    hitstunMul: 0.40,       // のけぞり・吹っ飛びで操作できない時間（吹っ飛び量 × この値）
    tumbleKb: 80,           // この値より強く飛ばされると、きりもみ状態になる
    hitlagBase: 3,          // 当たった瞬間に止まる「ヒットストップ」の基本コマ数
    hitlagMul: 0.38,        // ダメージに応じて増えるヒットストップ
    groundFriction: 0.7,    // 地上での止まりやすさ
    jumpSquat: 3,           // ジャンプの踏み込み（コマ）
    shortHopRatio: 0.68,    // 小ジャンプの強さ（大ジャンプに対する割合）
    shortHopWindow: 6,      // ジャンプボタンをこのコマ数より早く離すと小ジャンプ
    fastFallMul: 1.6,       // 急降下の速さ（落下の最高速度に対する倍率）
    techWindow: 20,         // 着地の何コマ前までにシールドを押せば受け身になるか
    techLockout: 40,        // 受け身に失敗したあと、もう一度押せるまでのコマ
    downMinTime: 18,        // ダウンしてから起き上がれるまでの最短コマ
    downAutoTime: 90,       // 何もしないと自動で起き上がるまでのコマ
    shieldMax: 50,          // シールドの耐久
    shieldDrain: 0.14,      // シールドを張っている間に減る量（1コマあたり）
    shieldRegen: 0.10,      // 張っていないときに回復する量
    shieldBreakStun: 200,   // シールドが割れたときの気絶コマ数
    grabHoldBase: 90,       // つかんでいられる時間（相手の％が高いほど長くなる）
    ledgeInvuln: 55,        // 崖をつかんだときの無敵（つかみ直すたびに短くなる）
    ledgeHangMax: 300,      // 崖につかまっていられる最長コマ
    ledgeRegrab: 30,        // 崖を離したあと、もう一度つかめるまでのコマ
    meteorMinKb: 75,        // メテオの最低の吹っ飛び（低い％でも崖の外なら落ちていく強さ）
    cineStrongPct: 100,     // 強烈な一撃の演出：相手の％がこれ以上で…
    cineStrongKb: 140,      // …この強さ以上の吹っ飛びなら演出を出す
    cineCooldown: 150,      // 演出が続けて出すぎないための間隔（コマ）
  },

  stage: {
    name: '天空の舞台（仮）',
    halfWidth: 450,         // ステージの横幅の半分
    thickness: 70,          // ステージの厚み
    blast: { left: -1150, right: 1150, top: -950, bottom: 650 }, // 撃墜ライン
  },

  /* ---------- CPUの強さ（キャラ選択画面で選べます） ---------- */
  cpu: {
    default: 'normal',
    levels: {
      weak:   { name: '弱い',   reaction: 22, aggression: 0.35, shieldChance: 0.08, mistake: 0.35, techChance: 0.1, combo: 0.0 },
      normal: { name: 'ふつう', reaction: 10, aggression: 0.6,  shieldChance: 0.22, mistake: 0.12, techChance: 0.45, combo: 0.35 },
      strong: { name: '強い',   reaction: 4,  aggression: 0.8,  shieldChance: 0.38, mistake: 0.03, techChance: 0.85, combo: 0.8 },
    },
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
     全キャラ共通の技（起き上がり攻撃・崖攻撃）
     ===================================================================== */
  common: {
    getupAttack: { name: '起き上がり攻撃', dur: 40, invuln: [0, 18],
                   poses: [[0,'down'],[8,'getupSweep',{r:0}],[18,'getupSweep'],[26,'crouch'],[40,'idle']],
                   hits: [{ f:[16,18], x:42, y:12, r:24, dmg:6, ang:30, bkb:65, kbg:30 },
                          { f:[16,18], x:-42, y:12, r:24, dmg:6, ang:150, bkb:65, kbg:30 }] },
    ledgeAttack: { name: '崖攻撃', dur: 44, invuln: [0, 20],
                   poses: [[0,'ledgeHang'],[10,'ledgeClimb'],[18,'kickWind'],[22,'kick'],[30,'kick'],[44,'idle']],
                   hits: [{ f:[22,25], x:42, y:30, r:24, dmg:9, ang:40, bkb:70, kbg:30 }] },
  },

  /* =====================================================================
     武器ごとの共通技（A・空中攻撃・スマッシュ）
     同じ武器のキャラは同じ動きの形を使い、強さはキャラごとの倍率で変わります
     ===================================================================== */
  weapons: {

    /* ---------- 素手（プロレスラー：拳闘士） ---------- */
    unarmed: {
      jab:   { name: '弱1：逆水平チョップ', dur: 18, iasa: 15, next: { key:'jab2', f:[4,14] },
               poses: [[0,'chopWind'],[3,'chop'],[7,'chop'],[18,'idle']],
               hits: [{ f:[3,4], x:40, y:72, r:16, dmg:3, ang:20, fkb:30, react:'light' }] },
      jab2:  { name: '弱2：エルボー', dur: 20, iasa: 17, next: { key:'jab3', f:[4,16] },
               poses: [[0,'elbowWind'],[3,'elbow'],[8,'elbow'],[20,'idle']],
               hits: [{ f:[3,4], x:34, y:72, r:16, dmg:3, ang:20, fkb:32, react:'light' }] },
      jab3:  { name: '弱3：ヘッドバット', dur: 32, iasa: 28,
               poses: [[0,'headbuttWind'],[6,'headbutt'],[12,'headbutt'],[32,'idle']],
               hits: [{ f:[6,8], x:34, y:86, r:20, dmg:6, ang:42, bkb:60, kbg:70 }] },
      utilt: { name: '上強：かち上げエルボー', dur: 30, iasa: 26,
               poses: [[0,'elbowUpWind'],[6,'elbowUp'],[14,'elbowUp'],[30,'idle']],
               hits: [{ f:[6,10], x:18, y:100, r:22, dmg:9, ang:90, bkb:45, kbg:92 },
                      { f:[6,7], x:30, y:60, r:18, dmg:8, ang:92, bkb:48, kbg:85 }] },
      ftilt: { name: '横強：ビッグブーツ', dur: 32, iasa: 28,
               poses: [[0,'bigBootWind'],[8,'bigBoot'],[15,'bigBoot'],[32,'idle']],
               hits: [{ f:[8,10], x:46, y:48, r:19, dmg:12, ang:38, bkb:35, kbg:94 }] },
      dtilt: { name: '下強：スライディング（ダウン）', dur: 34, iasa: 30,
               poses: [[0,'crouch'],[4,'slide'],[16,'slide'],[24,'crouch'],[34,'idle']],
               events: [{ f:[4,14], vx:6.5 }],
               hits: [{ f:[4,13], x:38, y:10, r:18, dmg:8, ang:80, bkb:45, kbg:45, react:'down' }] },

      fsmash:{ name: '横スマ：ラリアット（アーマー）', dur: 66, charge: { f:10, max:60, mul:1.4 }, armor: [4, 16],
               poses: [[0,'lariatWind'],[10,'lariatWind'],[16,'lariatFull'],[30,'lariatFull'],[46,'jabReady'],[66,'idle']],
               events: [{ f:15, vx:6 }],
               hits: [{ f:[16,19], x:48, y:72, r:26, dmg:24, ang:38, bkb:45, kbg:104 }] },
      usmash:{ name: '上スマ：真上ヘッドバット', dur: 62, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[14,'headbuttUp'],[26,'headbuttUp'],[62,'idle']],
               hits: [{ f:[14,18], x:4, y:118, r:28, dmg:20, ang:88, bkb:42, kbg:102 },
                      { f:[14,15], x:22, y:60, r:22, dmg:12, ang:90, bkb:50, kbg:80 }] },
      dsmash:{ name: '下スマ：ストンピング', dur: 60, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'stompWind'],[10,'stompWind'],[16,'stompDown'],[30,'stompDown'],[60,'idle']],
               events: [{ f:16, quake:true }],
               hits: [{ f:[16,19], x:50, y:8, r:26, dmg:18, ang:30, bkb:42, kbg:96 },
                      { f:[16,19], x:-50, y:8, r:26, dmg:18, ang:150, bkb:42, kbg:96 }] },

      nair:  { name: '空N：ボディプレス', dur: 40, landLag: 10,
               poses: [[0,'fall'],[4,'bodyPress'],[24,'bodyPress'],[40,'fall']],
               hits: [{ f:[5,8], x:5, y:40, r:36, dmg:12, ang:45, bkb:30, kbg:85 },
                      { f:[9,22], x:5, y:40, r:32, dmg:7, ang:45, bkb:25, kbg:65 }] },
      fair:  { name: '空前：ダブルスレッジハンマー（拳の先はメテオ）', dur: 46, landLag: 18,
               poses: [[0,'fall'],[4,'overheadWind'],[13,'overheadWind'],[16,'overheadSlam'],[28,'overheadSlam'],[46,'fall']],
               hits: [{ f:[16,17], x:46, y:28, r:16, dmg:15, ang:285, bkb:40, kbg:80 },
                      { f:[16,18], x:34, y:58, r:22, dmg:13, ang:45, bkb:35, kbg:92 }] },
      bair:  { name: '空後：ドロップキック', dur: 38, landLag: 12,
               poses: [[0,'fall'],[4,'backKickWind'],[8,'dropkick'],[18,'dropkick'],[38,'fall']],
               hits: [{ f:[8,11], x:-50, y:40, r:24, dmg:15, ang:140, bkb:34, kbg:100 }] },
      uair:  { name: '空上：サマーソルトキック', dur: 32, landLag: 8,
               poses: [[0,'fall',{r:0}],[4,'tuck',{r:-60}],[7,'upKick',{r:-150}],[14,'upKick',{r:-250}],[24,'tuck',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[6,10], x:0, y:110, r:26, dmg:11, ang:85, bkb:32, kbg:90 }] },
      dair:  { name: '空下：フットスタンプ（メテオ）', dur: 44, landLag: 22,
               poses: [[0,'fall'],[4,'tuck'],[12,'footStamp'],[24,'footStamp'],[44,'fall']],
               hits: [{ f:[12,15], x:2, y:-6, r:22, dmg:15, ang:270, bkb:40, kbg:75 }] },
    },

    /* ---------- ムチ ---------- */
    whip: {
      jab:   { name: '弱1：ムチはじき', dur: 18, iasa: 15, next: { key:'jab2', f:[4,15] },
               poses: [[0,'jabReady'],[3,'swingFwd',{tw:0.4}],[7,'swingFwd'],[13,'jabReady'],[18,'idle']],
               hits: [{ f:[3,4], x:62, y:62, r:16, dmg:2, ang:20, fkb:28, react:'light' },
                      { f:[3,4], x:88, y:62, r:12, dmg:2.5, ang:20, fkb:28, react:'light' }] },
      jab2:  { name: '弱2：返しムチ', dur: 20, iasa: 17, next: { key:'jab3', f:[4,16] },
               poses: [[0,'swingFwd'],[3,'swingBackhand',{tw:-0.4}],[8,'swingBackhand'],[20,'idle']],
               hits: [{ f:[3,4], x:70, y:72, r:18, dmg:2, ang:20, fkb:30, react:'light' }] },
      jab3:  { name: '弱3：ムチ打ち下ろし', dur: 30, iasa: 26,
               poses: [[0,'overheadWind'],[6,'swingFwd',{tw:0.8}],[12,'swingFwd'],[30,'idle']],
               hits: [{ f:[6,8], x:85, y:50, r:20, dmg:4, ang:40, bkb:55, kbg:65 }] },
      utilt: { name: '上強：頭上ムチ', dur: 30, iasa: 25,
               poses: [[0,'swingUpWind'],[7,'swingUp'],[16,'swingUp'],[30,'idle']],
               hits: [{ f:[7,12], x:28, y:112, r:24, dmg:7, ang:88, bkb:38, kbg:90 }] },
      ftilt: { name: '横強：ムチ打ち', dur: 32, iasa: 28,
               poses: [[0,'swingWind'],[9,'swingFwd',{tw:0.6}],[18,'swingFwd'],[32,'idle']],
               hits: [{ f:[9,11], x:122, y:58, r:13, dmg:11, ang:40, bkb:30, kbg:88 },
                      { f:[9,11], x:90, y:58, r:16, dmg:8, ang:40, bkb:30, kbg:80 }] },
      dtilt: { name: '下強：低空ムチ', dur: 22, iasa: 18,
               poses: [[0,'swingLowWind'],[6,'swingLow'],[13,'swingLow'],[22,'crouch']],
               hits: [{ f:[6,8], x:88, y:8, r:15, dmg:6, ang:75, bkb:38, kbg:55 }] },

      fsmash:{ name: '横スマ：大ムチ', dur: 64, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'swingWind'],[10,'swingWind'],[18,'swingFwd',{tw:1}],[32,'swingFwd'],[64,'idle']],
               hits: [{ f:[18,20], x:145, y:58, r:17, dmg:17, ang:38, bkb:40, kbg:110 },
                      { f:[18,20], x:95, y:58, r:18, dmg:13, ang:40, bkb:36, kbg:90 }] },
      usmash:{ name: '上スマ：頭上旋回', dur: 60, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[14,'swingUp'],[28,'swingUp'],[60,'idle']],
               hits: [{ f:[14,22], x:0, y:118, r:32, dmg:15, ang:90, bkb:42, kbg:102 },
                      { f:[14,16], x:22, y:55, r:24, dmg:10, ang:88, bkb:48, kbg:80 }] },
      dsmash:{ name: '下スマ：両側ムチ', dur: 60, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'swingLowWind'],[8,'swingLowWind'],[12,'swingLow'],[18,'swingLow'],[22,'swingLow'],[60,'idle']],
               events: [{ f:17, turn:true }, { f:34, turn:true }],
               hits: [{ f:[12,14], x:85, y:8, r:18, dmg:14, ang:25, bkb:38, kbg:96 },
                      { f:[20,22], x:85, y:8, r:18, dmg:14, ang:25, bkb:38, kbg:96 }] },

      nair:  { name: '空N：回転ムチ', dur: 38, landLag: 10,
               poses: [[0,'fall',{r:0}],[5,'swingFwd',{r:0}],[24,'swingFwd',{r:-720}],[38,'fall',{r:-720}]],
               hits: [{ f:[6,21], x:55, y:45, r:26, dmg:2.5, ang:70, bkb:12, kbg:15, rehit:5, react:'light' },
                      { f:[6,21], x:-55, y:45, r:26, dmg:2.5, ang:110, bkb:12, kbg:15, rehit:5, react:'light' },
                      { f:[22,24], x:0, y:45, r:60, dmg:5, ang:45, bkb:40, kbg:85 }] },
      fair:  { name: '空前：前ムチ', dur: 34, landLag: 9,
               poses: [[0,'fall'],[3,'swingWind'],[9,'swingFwd',{tw:0.6}],[18,'swingFwd'],[34,'fall']],
               hits: [{ f:[9,12], x:92, y:48, r:17, dmg:9, ang:40, bkb:30, kbg:85 }] },
      bair:  { name: '空後：後ろムチ', dur: 36, landLag: 10,
               poses: [[0,'fall'],[4,'swingWind'],[9,'aimBack',{tw:-0.6}],[18,'aimBack'],[36,'fall']],
               hits: [{ f:[9,12], x:-98, y:50, r:18, dmg:10, ang:140, bkb:30, kbg:92 }] },
      uair:  { name: '空上：真上ムチ', dur: 32, landLag: 8,
               poses: [[0,'fall'],[3,'swingUpWind'],[8,'swingUp'],[16,'swingUp'],[32,'fall']],
               hits: [{ f:[8,12], x:10, y:125, r:18, dmg:8, ang:88, bkb:30, kbg:90 }] },
      dair:  { name: '空下：真下ムチ（メテオ）', dur: 38, landLag: 14,
               poses: [[0,'fall'],[3,'swingUp'],[10,'swingDown'],[20,'swingDown'],[38,'fall']],
               hits: [{ f:[10,13], x:0, y:-60, r:17, dmg:10, ang:275, bkb:20, kbg:70 }] },
    },

    /* ---------- 弓（中国の伝説的な弓の名手：弓使い） ---------- */
    bow: {
      jab:   { name: '弱1：弓先突き', dur: 17, iasa: 14, next: { key:'jab2', f:[3,13] },
               poses: [[0,'jabReady'],[2,'bowJab'],[6,'bowJab'],[12,'jabReady'],[17,'idle']],
               hits: [{ f:[2,3], x:44, y:66, r:15, dmg:2.5, ang:20, fkb:28, react:'light' }] },
      jab2:  { name: '弱2：掌打', dur: 19, iasa: 16, next: { key:'jab3', f:[4,15] },
               poses: [[0,'jabReady'],[3,'palm'],[7,'palm'],[19,'idle']],
               hits: [{ f:[3,4], x:36, y:68, r:16, dmg:2.5, ang:20, fkb:30, react:'light' }] },
      jab3:  { name: '弱3：弓払い', dur: 30, iasa: 26,
               poses: [[0,'bowSweepWind'],[5,'bowSweep'],[11,'bowSweep'],[30,'idle']],
               hits: [{ f:[5,7], x:52, y:60, r:22, dmg:5, ang:40, bkb:55, kbg:65 }] },
      utilt: { name: '上強：弓旋回', dur: 30, iasa: 25,
               poses: [[0,'bowSpinUp',{wr:0}],[6,'bowSpinUp',{wr:200}],[14,'bowSpinUp',{wr:560}],[30,'idle',{wr:720}]],
               hits: [{ f:[6,8], x:40, y:95, r:22, dmg:7, ang:90, bkb:42, kbg:88 },
                      { f:[9,11], x:0, y:120, r:24, dmg:7, ang:90, bkb:42, kbg:88 },
                      { f:[12,13], x:-35, y:95, r:22, dmg:7, ang:95, bkb:42, kbg:88 }] },
      ftilt: { name: '横強：側踹（そくたん）', dur: 30, iasa: 26,
               poses: [[0,'sideKickWind'],[7,'sideKick'],[14,'sideKick'],[30,'idle']],
               hits: [{ f:[7,9], x:58, y:50, r:17, dmg:10, ang:38, bkb:32, kbg:90 },
                      { f:[7,9], x:34, y:50, r:15, dmg:8, ang:40, bkb:30, kbg:80 }] },
      dtilt: { name: '下強：足元払い（ダウン）', dur: 22, iasa: 18,
               poses: [[0,'swingLowWind'],[5,'swingLow'],[12,'swingLow'],[22,'crouch']],
               hits: [{ f:[5,7], x:60, y:8, r:17, dmg:6, ang:80, bkb:40, kbg:45, react:'down' }] },

      fsmash:{ name: '横スマ：弓棍・全力振り', dur: 62, charge: { f:9, max:60, mul:1.4 },
               poses: [[0,'staffWind'],[9,'staffWind'],[15,'staffSwing'],[28,'staffSwing'],[62,'idle']],
               events: [{ f:14, vx:4 }],
               hits: [{ f:[15,17], x:72, y:62, r:18, dmg:19, ang:38, bkb:42, kbg:104 },
                      { f:[15,17], x:40, y:62, r:20, dmg:15, ang:40, bkb:38, kbg:92 }] },
      usmash:{ name: '上スマ：三連天矢', dur: 58, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'aimUp'],[8,'aimUp'],[13,'releaseUp'],[28,'releaseUp'],[58,'idle']],
               hits: [{ f:[12,14], x:10, y:95, r:22, dmg:9, ang:90, bkb:50, kbg:70 }],
               events: [{ f:13, proj:'arrow', ang:80, x:0, y:95, speed:18, dmg:6, kang:88, bkb:40, kbg:75 },
                        { f:13, proj:'arrow', ang:90, x:0, y:95, speed:18, dmg:6, kang:88, bkb:40, kbg:75 },
                        { f:13, proj:'arrow', ang:100, x:0, y:95, speed:18, dmg:6, kang:88, bkb:40, kbg:75 }] },
      dsmash:{ name: '下スマ：回旋脚', dur: 58, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'plantWind',{yw:0}],[8,'plantWind',{yw:0}],[12,'plantKick',{yw:0}],[16,'plantKick',{yw:180}],[22,'plantKick',{yw:360}],[58,'idle',{yw:360}]],
               hits: [{ f:[12,14], x:55, y:12, r:22, dmg:15, ang:30, bkb:40, kbg:96 },
                      { f:[17,19], x:-55, y:12, r:22, dmg:15, ang:150, bkb:40, kbg:96 }] },

      nair:  { name: '空N：旋風脚', dur: 36, landLag: 8,
               poses: [[0,'fall',{yw:0}],[4,'tornadoKick',{yw:0}],[18,'tornadoKick',{yw:720}],[36,'fall',{yw:720}]],
               hits: [{ f:[5,9], x:40, y:45, r:26, dmg:6, ang:60, bkb:35, kbg:40 },
                      { f:[5,9], x:-40, y:45, r:26, dmg:6, ang:120, bkb:35, kbg:40 },
                      { f:[12,16], x:0, y:45, r:44, dmg:6, ang:45, bkb:38, kbg:82, rehit:4 }] },
      fair:  { name: '空前：弓振り下ろし', dur: 34, landLag: 10,
               poses: [[0,'fall'],[3,'overheadWind'],[9,'swingFwd'],[16,'swingFwd'],[34,'fall']],
               hits: [{ f:[9,11], x:52, y:48, r:21, dmg:10, ang:50, bkb:32, kbg:86 }] },
      bair:  { name: '空後：振り向き後ろ蹴り', dur: 34, landLag: 11,
               poses: [[0,'fall'],[3,'backKickWind'],[7,'backKick'],[16,'backKick'],[34,'fall']],
               hits: [{ f:[7,9], x:-54, y:40, r:21, dmg:13, ang:140, bkb:32, kbg:100 }] },
      uair:  { name: '空上：宙返り蹴り', dur: 32, landLag: 8,
               poses: [[0,'fall',{r:0}],[4,'tuck',{r:-60}],[7,'upKick',{r:-150}],[14,'upKick',{r:-250}],[24,'tuck',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[6,10], x:0, y:108, r:26, dmg:9, ang:85, bkb:32, kbg:88 }] },
      dair:  { name: '空下：落星（メテオ）', dur: 40, landLag: 14,
               poses: [[0,'fall'],[4,'aimDown'],[11,'releaseDown'],[40,'fall']],
               events: [{ f:11, proj:'arrow', ang:-90, x:0, y:20, speed:20, dmg:9, kang:270, bkb:40, kbg:70 }, { f:11, vy:5 }] },
    },

    /* ---------- 鏡の盾 ---------- */
    mirror: {
      jab:   { name: '弱1：盾で押す', dur: 18, iasa: 15, next: { key:'jab2', f:[4,15] },
               poses: [[0,'guardWind'],[3,'bash',{tw:0.5}],[7,'bash'],[13,'guardWind'],[18,'idle']],
               hits: [{ f:[3,4], x:40, y:60, r:18, dmg:2.5, ang:20, fkb:28, react:'light' }] },
      jab2:  { name: '弱2：盾ふり上げ', dur: 20, iasa: 17, next: { key:'jab3', f:[4,16] },
               poses: [[0,'guardDown'],[3,'guardUp',{tw:-0.3}],[8,'guardUp'],[20,'idle']],
               hits: [{ f:[3,4], x:32, y:80, r:20, dmg:2.5, ang:30, fkb:30, react:'light' }] },
      jab3:  { name: '弱3：盾たたきつけ', dur: 32, iasa: 28,
               poses: [[0,'guardUp'],[6,'bash',{tw:0.9}],[12,'bash'],[32,'idle']],
               hits: [{ f:[6,8], x:46, y:55, r:24, dmg:5, ang:40, bkb:58, kbg:65 }] },
      utilt: { name: '上強：盾つき上げ', dur: 28, iasa: 24,
               poses: [[0,'guardDown'],[6,'guardUp'],[15,'guardUp'],[28,'idle']],
               hits: [{ f:[6,11], x:15, y:108, r:24, dmg:8, ang:90, bkb:42, kbg:90 }] },
      ftilt: { name: '横強：盾ぶつけ', dur: 30, iasa: 26,
               poses: [[0,'guardWind'],[7,'bash',{tw:0.6}],[15,'bash'],[30,'idle']],
               events: [{ f:6, vx:3 }],
               hits: [{ f:[7,10], x:48, y:58, r:22, dmg:9, ang:35, bkb:40, kbg:85 }] },
      dtilt: { name: '下強：盾すべり（ダウン）', dur: 24, iasa: 20,
               poses: [[0,'crouch'],[6,'guardLow'],[13,'guardLow'],[24,'crouch']],
               hits: [{ f:[6,9], x:50, y:12, r:18, dmg:7, ang:80, bkb:40, kbg:50, react:'down' }] },

      fsmash:{ name: '横スマ：盾タックル', dur: 62, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'guardWind'],[10,'guardWind'],[15,'bash',{tw:1}],[30,'bash'],[62,'idle']],
               events: [{ f:14, vx:5 }],
               hits: [{ f:[15,18], x:55, y:58, r:26, dmg:19, ang:38, bkb:42, kbg:102 }] },
      usmash:{ name: '上スマ：盾かち上げ', dur: 60, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[13,'guardUp'],[28,'guardUp'],[60,'idle']],
               hits: [{ f:[13,18], x:0, y:118, r:28, dmg:17, ang:88, bkb:42, kbg:102 },
                      { f:[13,15], x:22, y:55, r:24, dmg:11, ang:88, bkb:48, kbg:80 }] },
      dsmash:{ name: '下スマ：盾たたきつけ', dur: 60, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'smashDownWind'],[10,'smashDownWind'],[14,'guardLow'],[32,'guardLow'],[60,'idle']],
               hits: [{ f:[14,17], x:45, y:10, r:22, dmg:16, ang:35, bkb:42, kbg:96 },
                      { f:[14,17], x:-45, y:10, r:22, dmg:16, ang:145, bkb:42, kbg:96 }] },

      nair:  { name: '空N：盾回転', dur: 34, landLag: 9,
               poses: [[0,'fall',{r:0}],[4,'guard',{r:0}],[16,'guard',{r:-360}],[34,'fall',{r:-360}]],
               hits: [{ f:[5,9], x:0, y:45, r:36, dmg:9, ang:45, bkb:25, kbg:80 },
                      { f:[10,16], x:0, y:45, r:32, dmg:5, ang:45, bkb:20, kbg:60 }] },
      fair:  { name: '空前：盾はらい', dur: 36, landLag: 12,
               poses: [[0,'fall'],[3,'guardWind'],[9,'bash',{tw:0.6}],[18,'bash'],[36,'fall']],
               hits: [{ f:[9,12], x:48, y:50, r:22, dmg:11, ang:45, bkb:32, kbg:88 }] },
      bair:  { name: '空後：後ろ蹴り', dur: 34, landLag: 10,
               poses: [[0,'fall'],[3,'backKickWind'],[6,'backKick'],[16,'backKick'],[34,'fall']],
               hits: [{ f:[6,9], x:-50, y:40, r:20, dmg:12, ang:140, bkb:30, kbg:92 }] },
      uair:  { name: '空上：盾つき上げ', dur: 32, landLag: 8,
               poses: [[0,'fall'],[3,'guardDown'],[6,'guardUp'],[14,'guardUp'],[32,'fall']],
               hits: [{ f:[6,10], x:0, y:108, r:26, dmg:10, ang:88, bkb:30, kbg:90 }] },
      dair:  { name: '空下：盾落とし（メテオ）', dur: 40, landLag: 16,
               poses: [[0,'fall'],[4,'tuck'],[10,'guardDownAir'],[20,'guardDownAir'],[40,'fall']],
               hits: [{ f:[10,14], x:0, y:-8, r:22, dmg:12, ang:275, bkb:25, kbg:75 }] },
    },
  },

  /* ---------- つかみ・投げ（全キャラ共通。キャラごとに変えたい場合は overrides で） ---------- */
  throws: {
    grab:   { name: 'つかみ', dur: 30, poses: [[0,'idle'],[5,'grab'],[14,'grab'],[30,'idle']],
              hits: [{ f:[6,9], x:40, y:55, r:20, grab:true }] },
    fthrow: { name: '前投げ', dur: 26, release: 10, poses: [[0,'hold'],[8,'throwFwd',{tw:0.8}],[26,'idle']],
              held: [[0,36,0],[8,48,10]], hit: { dmg:8, ang:40, bkb:55, kbg:60 } },
    bthrow: { name: '後ろ投げ', dur: 32, release: 12, poses: [[0,'hold'],[10,'throwFwd',{tw:0.8}],[32,'idle']],
              events: [{ f:0, turn:true }],
              held: [[0,-36,0],[6,-10,40],[11,44,15]], hit: { dmg:10, ang:42, bkb:60, kbg:70 } },
    uthrow: { name: '上投げ', dur: 30, release: 12, poses: [[0,'hold'],[11,'throwUp'],[30,'idle']],
              held: [[0,36,0],[11,5,105]], hit: { dmg:7, ang:90, bkb:65, kbg:70 } },
    dthrow: { name: '下投げ', dur: 32, release: 13, poses: [[0,'hold'],[12,'throwDown'],[32,'idle']],
              held: [[0,36,0],[12,34,-2]], hit: { dmg:6, ang:80, bkb:55, kbg:35 } },
  },

  /* =====================================================================
     キャラクター（今は代表の4体）
     specials: B（必殺技）。地上4種 + 空中5種 = 9種、すべて別の技。ためはありません
     overrides: 共通技をこのキャラだけ変えたいときに使う
       例）overrides: { jab: { hits: [{ dmg: 5 }] } } … このキャラの弱1だけダメージ5に
     ===================================================================== */
  characters: [

    /* ===== 1：拳闘士（近距離・パワー・プロレスラー） ===== */
    {
      id: 'fist', no: 1, name: '拳闘士', range: '近距離', type: 'パワー', weapon: 'unarmed',
      stats: { weight: 125, walk: 2.8, run: 5.0, air: 3.2, airAccel: 0.32, jump: 13.8, djump: 12.8,
               gravity: 0.66, fall: 11, airJumps: 1, dmgMul: 1.1, kbMul: 1.0, speed: 0.92 },
      look: { thick: 9.5, head: 11.5 },
      cpu: { style: 'rush', range: 55, cgrab: true },
      specials: {
        /* --- 地上 --- */
        n:    { name: 'NB：剛腕チョップ（アーマー）', dur: 60, armor: [3, 17],
                poses: [[0,'chopBigWind'],[12,'chopBigWind'],[18,'chopBig'],[32,'chopBig'],[60,'idle']],
                events: [{ f:17, vx:5 }],
                hits: [{ f:[18,21], x:46, y:62, r:25, dmg:18, ang:40, bkb:45, kbg:90 }] },
        side: { name: '横B：ローリングプレス（つかみ）', dur: 54,
                poses: [[0,'crouch'],[6,'leapGrab'],[20,'leapGrab'],[30,'crouch'],[54,'idle']],
                events: [{ f:6, vy:6 }, { f:[6,20], vx:8 }],
                hits: [{ f:[7,20], x:40, y:45, r:26, cgrab:'sspecialHit' }] },
        up:   { name: '上B：サイクロンアッパー', dur: 48, helpless: true, landLag: 20,
                poses: [[0,'uppercutWind',{yw:0}],[4,'uppercut',{yw:0}],[22,'uppercut',{yw:1080}],[30,'uppercut',{yw:1080}],[48,'helpless',{yw:1080}]],
                events: [{ f:[4,20], vy:12, vx:2 }, { f:21, vy:2 }],
                gravityFrames: [0,21],
                hits: [{ f:[4,18], x:8, y:100, r:16, dmg:2, ang:88, bkb:20, kbg:8, rehit:4, react:'light' },
                       { f:[19,21], x:8, y:105, r:20, dmg:6, ang:80, bkb:55, kbg:75, rehit:2 }] },
        down: { name: '下B：スリーパーホールド（つかみ）', dur: 46,
                poses: [[0,'jabReady'],[6,'grab'],[12,'grab'],[46,'idle']],
                hits: [{ f:[7,10], x:32, y:60, r:18, cgrab:'dspecialHit' }] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中剛腕チョップ', dur: 50, landLag: 16, gravityMul: 0.5,
                poses: [[0,'chopBigWind'],[10,'chopBigWind'],[16,'chopBig'],[28,'chopBig'],[50,'fall']],
                hits: [{ f:[16,19], x:46, y:58, r:24, dmg:15, ang:40, bkb:42, kbg:86 }] },
        airF: { name: '空中前B：フライングボディアタック', dur: 44, landLag: 16, oncePerAir: true, gravityMul: 0.15,
                poses: [[0,'tuck'],[6,'bodyAttack'],[24,'bodyAttack'],[44,'fall']],
                events: [{ f:0, vy:2 }, { f:[6,24], vx:10 }],
                hits: [{ f:[6,24], x:30, y:50, r:28, dmg:12, ang:45, bkb:40, kbg:75 }] },
        airB: { name: '空中後B：振り向きバックハンド', dur: 40, landLag: 14,
                poses: [[0,'chopWind'],[10,'backhand'],[22,'backhand'],[40,'fall']],
                events: [{ f:3, turn:true }],
                hits: [{ f:[10,13], x:48, y:62, r:22, dmg:15, ang:40, bkb:40, kbg:92 }] },
        airU: { name: '空中上B：サイクロンアッパー', dur: 48, helpless: true, landLag: 20,
                poses: [[0,'uppercutWind',{yw:0}],[4,'uppercut',{yw:0}],[22,'uppercut',{yw:1080}],[30,'uppercut',{yw:1080}],[48,'helpless',{yw:1080}]],
                events: [{ f:[4,20], vy:13.5, vx:3 }, { f:21, vy:2 }],
                gravityFrames: [0,21],
                hits: [{ f:[4,18], x:8, y:100, r:16, dmg:2, ang:88, bkb:20, kbg:8, rehit:4, react:'light' },
                       { f:[19,21], x:8, y:105, r:20, dmg:6, ang:80, bkb:55, kbg:75, rehit:2 }] },
        airD: { name: '空中下B：ダイビングエルボー（メテオ）', dur: 70, landLag: 26, helpless: true,
                poses: [[0,'tuck'],[8,'divingElbow'],[70,'divingElbow']],
                events: [{ f:0, vy:5 }, { f:[9,69], vy:-17, vx:0 }],
                gravityFrames: [0,70],
                landSpawn: [{ proj:'shock', dir:1 }, { proj:'shock', dir:-1 }],
                hits: [{ f:[9,69], x:6, y:15, r:24, dmg:13, ang:270, bkb:40, kbg:70 }] },
      },
      // 必殺技でつかんだ後の動き（held = つかんだ相手の位置 [コマ, 前, 上, 回転]）
      extraMoves: {
        sspecialHit: { name: 'ローリングプレス（命中）', dur: 62, release: 46, noLandCancel: true,
                poses: [[0,'leapGrab',{r:0}],[6,'tuck',{r:0}],[18,'tuck',{r:360}],[30,'tuck',{r:720}],[38,'bodyPress',{r:790,pa:1}],[48,'bodyPress',{r:790,pa:1}],[62,'idle',{r:720}]],
                events: [{ f:[2,34], vx:5 }],
                held: [[0,40,20,0],[6,12,25,0],[18,12,25,-360],[30,12,25,-720],[38,30,0,-810],[46,30,0,-810]],
                hit: { dmg:13, ang:80, fkb:35, react:'down' } },
        dspecialHit: { name: 'スリーパーホールド（命中）', dur: 72, release: 58, noLandCancel: true, faceAway: true,
                poses: [[0,'grab'],[6,'sleeperHold',{tw:0}],[20,'sleeperHold',{tw:0.4}],[28,'sleeperHold',{tw:-0.4}],[36,'sleeperHold',{tw:0.4}],[44,'sleeperHold',{tw:-0.4}],[56,'sleeperHold',{t:24}],[72,'idle']],
                held: [[0,26,0,0],[8,16,0,0],[56,18,0,-20]],
                hit: { dmg:12, ang:85, fkb:20, react:'down' } },
      },
      throws: {
        fthrow: { name: '前投げ：ボディスラム', dur: 34, release: 16, poses: [[0,'hold'],[8,'throwUp'],[16,'throwDown'],[34,'idle']],
                  held: [[0,36,0,0],[8,10,110,-90],[15,40,0,-180]], hit: { dmg:11, ang:45, bkb:60, kbg:66 } },
        bthrow: { name: '後ろ投げ：ジャーマンスープレックス', dur: 44, release: 22,
                  poses: [[0,'hold'],[8,'germanWind'],[18,'germanBridge'],[30,'germanBridge'],[44,'idle']],
                  held: [[0,30,0,0],[8,20,40,0],[18,-10,100,180],[22,-45,10,180]], hit: { dmg:13, ang:140, bkb:65, kbg:82 } },
        uthrow: { name: '上投げ：リフトアップ', dur: 36, release: 16, poses: [[0,'hold'],[10,'throwUp'],[16,'throwUp'],[36,'idle']],
                  held: [[0,36,0,0],[10,0,120,90],[16,0,130,90]], hit: { dmg:9, ang:90, bkb:70, kbg:70 } },
        dthrow: { name: '下投げ：パワーボム（ダウン）', dur: 40, release: 20, poses: [[0,'hold'],[10,'throwUp'],[20,'throwDown'],[40,'idle']],
                  held: [[0,36,0,0],[10,5,120,180],[19,36,0,180]], hit: { dmg:11, ang:80, fkb:35, react:'down' } },
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
               gravity: 0.58, fall: 10, airJumps: 1, dmgMul: 0.9, kbMul: 0.96, speed: 1.12 },
      look: { thick: 5.5, head: 10 },
      cpu: { style: 'mid', range: 110 },
      specials: {
        n:    { name: 'NB：ムチ連打（押し続けると続く）', dur: 32, loop: { from:6, to:20, max:6 },
                poses: [[0,'swingWind'],[6,'swingFwd'],[11,'swingWind'],[14,'swingFwd'],[20,'swingWind'],[24,'swingFwd'],[32,'idle']],
                hits: [{ f:[6,8], x:78, y:62, r:20, dmg:2, ang:80, bkb:18, kbg:5, react:'light' },
                       { f:[14,16], x:78, y:45, r:20, dmg:2, ang:80, bkb:18, kbg:5, react:'light' },
                       { f:[24,26], x:85, y:55, r:24, dmg:5, ang:40, bkb:45, kbg:70 }] },
        side: { name: '横B：ムチ引き寄せ', dur: 44,
                poses: [[0,'swingWind'],[10,'swingFwd'],[24,'pull'],[44,'idle']],
                hits: [{ f:[10,13], x:135, y:58, r:18, dmg:4, pull:true }] },
        up:   { name: '上B：ムチ上昇', dur: 40, helpless: true, landLag: 18,
                poses: [[0,'swingUpWind'],[5,'swingUp'],[20,'swingUp'],[40,'helpless']],
                events: [{ f:[5,20], vy:13.5, vx:1.5 }],
                gravityFrames: [0,21],
                hits: [{ f:[5,18], x:10, y:112, r:24, dmg:7, ang:85, bkb:40, kbg:70 }] },
        down: { name: '下B：両側足払い（ダウン）', dur: 36,
                poses: [[0,'swingLowWind'],[8,'swingLow'],[20,'swingLow'],[36,'idle']],
                hits: [{ f:[8,10], x:72, y:8, r:20, dmg:7, ang:80, bkb:50, kbg:40, react:'down' },
                       { f:[8,10], x:-72, y:8, r:20, dmg:7, ang:100, bkb:50, kbg:40, react:'down' }] },
        airN: { name: '空中NB：旋回ムチ', dur: 44, landLag: 12, gravityMul: 0.25,
                poses: [[0,'fall',{r:0}],[6,'swingFwd',{r:0}],[32,'swingFwd',{r:-1080}],[44,'fall',{r:-1080}]],
                events: [{ f:0, vy:2.5 }],
                hits: [{ f:[6,31], x:60, y:45, r:28, dmg:2.5, ang:75, bkb:15, kbg:10, rehit:5, react:'light' },
                       { f:[6,31], x:-60, y:45, r:28, dmg:2.5, ang:105, bkb:15, kbg:10, rehit:5, react:'light' },
                       { f:[33,35], x:0, y:45, r:65, dmg:5, ang:45, bkb:45, kbg:80 }] },
        airF: { name: '空中前B：飛びつきムチ', dur: 40, landLag: 12, oncePerAir: true, gravityMul: 0.2,
                poses: [[0,'swingWind'],[6,'swingFwd'],[20,'swingFwd'],[40,'fall']],
                events: [{ f:0, vy:1 }, { f:[4,20], vx:11 }],
                hits: [{ f:[6,20], x:55, y:48, r:22, dmg:8, ang:45, bkb:35, kbg:70 }] },
        airB: { name: '空中後B：バックラッシュ', dur: 38, landLag: 12,
                poses: [[0,'swingWind'],[12,'swingFwd',{tw:0.8}],[22,'swingFwd'],[38,'fall']],
                events: [{ f:2, turn:true }],
                hits: [{ f:[12,14], x:112, y:52, r:18, dmg:13, ang:40, bkb:35, kbg:95 }] },
        airU: { name: '空中上B：ムチ旋回上昇', dur: 42, helpless: true, landLag: 18,
                poses: [[0,'fall',{r:0}],[4,'swingUp',{r:0}],[24,'swingUp',{r:-720}],[42,'helpless',{r:-720}]],
                events: [{ f:[4,24], vy:15 }],
                gravityFrames: [0,25],
                hits: [{ f:[4,22], x:0, y:70, r:34, dmg:3, ang:88, bkb:30, kbg:30, rehit:6, react:'light' }] },
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
      stats: { weight: 92, walk: 3.4, run: 6.2, air: 3.9, airAccel: 0.42, jump: 15.2, djump: 14.2,
               gravity: 0.55, fall: 9.5, airJumps: 1, dmgMul: 1.0, kbMul: 1.0, speed: 1.0 },
      look: { thick: 6, head: 10 },
      cpu: { style: 'zone', range: 330, reflect: true },
      specials: {
        /* --- 地上 --- */
        // holdShot = Bを押している間ためて、離すと発射（min = ためなし、max = 最大ため）
        n:    { name: 'NB：穿楊（せんよう）ため撃ち', dur: 34,
                holdShot: { f:6, max:90, over:30, min:{ dmg:5, speed:13, bkb:25, kbg:45 }, max2:{ dmg:22, speed:26, bkb:45, kbg:92 } },
                poses: [[0,'aim'],[6,'aimDraw'],[9,'release'],[34,'idle']],
                events: [{ f:9, proj:'arrow', shot:true, ang:0, x:30, y:68 }] },
        side: { name: '横B：弓突進', dur: 42,
                poses: [[0,'spearWind'],[6,'spearThrust'],[20,'spearThrust'],[42,'idle']],
                events: [{ f:[6,20], vx:9 }],
                hits: [{ f:[6,20], x:45, y:60, r:20, dmg:9, ang:40, bkb:55, kbg:55 }] },
        up:   { name: '上B：天翔（てんしょう）攻撃なし', dur: 42, helpless: true, landLag: 16,
                poses: [[0,'aimDown'],[6,'releaseDown'],[10,'takeoff'],[26,'jump'],[42,'helpless']],
                events: [{ f:6, proj:'arrow', noHit:true, ang:-90, x:0, y:20, speed:24 }, { f:[6,22], vy:16 }, { f:23, vy:8 }],
                gravityFrames: [0,23] },
        down: { name: '下B：反射の構え（1.5倍）', dur: 34, reflect: { f:[4,24], x:15, y:55, r:62, mul:1.5 },
                poses: [[0,'guard',{wr:0}],[4,'guard',{wr:180}],[24,'guard',{wr:1440}],[34,'idle',{wr:1440}]] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中穿楊', dur: 32, landLag: 10, gravityMul: 0.25,
                holdShot: { f:6, max:60, over:20, min:{ dmg:5, speed:13, bkb:25, kbg:45 }, max2:{ dmg:18, speed:24, bkb:40, kbg:85 } },
                poses: [[0,'aim'],[6,'aimDraw'],[9,'release'],[32,'fall']],
                events: [{ f:9, proj:'arrow', shot:true, ang:0, x:30, y:68 }] },
        airF: { name: '空中前B：空中弓突進', dur: 40, landLag: 12, oncePerAir: true, gravityMul: 0.1,
                poses: [[0,'spearWind'],[5,'spearThrust'],[20,'spearThrust'],[40,'fall']],
                events: [{ f:0, vy:1 }, { f:[5,20], vx:10 }],
                hits: [{ f:[5,20], x:45, y:55, r:20, dmg:8, ang:45, bkb:50, kbg:55 }] },
        airB: { name: '空中後B：振り向き撃ち', dur: 36, landLag: 10,
                poses: [[0,'aim'],[12,'release'],[36,'fall']],
                events: [{ f:2, turn:true }, { f:12, proj:'arrow', ang:0, x:30, y:68, dmg:7, speed:18 }, { f:12, vx:-5 }] },
        airU: { name: '空中上B：天翔', dur: 42, helpless: true, landLag: 16,
                poses: [[0,'aimDown'],[6,'releaseDown'],[10,'takeoff'],[26,'jump'],[42,'helpless']],
                events: [{ f:6, proj:'arrow', noHit:true, ang:-90, x:0, y:20, speed:24 }, { f:[6,22], vy:16 }, { f:23, vy:8 }],
                gravityFrames: [0,23] },
        airD: { name: '空中下B：空中反射', dur: 36, landLag: 10, gravityMul: 0.25, reflect: { f:[4,24], x:15, y:55, r:62, mul:1.5 },
                poses: [[0,'guard',{wr:0}],[4,'guard',{wr:180}],[24,'guard',{wr:1440}],[36,'fall',{wr:1440}]],
                events: [{ f:0, vy:2 }] },
      },
      throws: {
        fthrow: { name: '前投げ：弓押し出し', dur: 26, release: 10, poses: [[0,'hold'],[9,'bowSweep'],[26,'idle']],
                  held: [[0,36,0,0],[9,50,8,0]], hit: { dmg:8, ang:40, bkb:55, kbg:62 } },
        bthrow: { name: '後ろ投げ：背負い投げ', dur: 34, release: 14, poses: [[0,'hold'],[7,'throwUp'],[13,'throwDown'],[34,'idle']],
                  events: [{ f:0, turn:true }],
                  held: [[0,-36,0,0],[7,-5,70,-90],[13,40,10,-180]], hit: { dmg:10, ang:40, bkb:60, kbg:72 } },
        uthrow: { name: '上投げ：打ち上げ射ち', dur: 40, release: 10, poses: [[0,'hold'],[10,'throwUp'],[15,'aimUp'],[19,'releaseUp'],[40,'idle']],
                  held: [[0,36,0,0],[10,10,90,0]], hit: { dmg:4, ang:90, bkb:75, kbg:45 },
                  events: [{ f:19, proj:'arrow', ang:90, x:0, y:90, speed:20, dmg:5, kang:88, bkb:40, kbg:60 }] },
        dthrow: { name: '下投げ：地面たたきつけ', dur: 34, release: 13, poses: [[0,'hold'],[6,'overheadWind'],[12,'throwDown'],[34,'idle']],
                  held: [[0,36,0,0],[6,30,50,0],[12,32,-2,0]], hit: { dmg:7, ang:82, bkb:60, kbg:40 } },
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
                poses: [[0,'guardWind'],[8,'bash',{tw:0.8}],[24,'bash'],[46,'idle']],
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
