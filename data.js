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
     ang が 235〜305（真下向き）の攻撃が空中の相手に当たると「メテオ」になり、真下にたたき落とします
   ■ ワイヤー（エージェント）
     wire    : ワイヤーを出すコマ [始まり, 終わり] / wireTip: ワイヤーの先の位置 [前, 上]（書かなければ一番遠い攻撃の位置）
   ■ キャラの見た目・覚醒
     look.scale : 体の大きさ（0.8 = 2割小さい。くらう範囲も小さくなる）
     portrait   : キャラ選択画面の絵
     model2 / swapPct : ％が swapPct を超えると model2 の姿に変わる
     awaken     : 覚醒。swapPct を超えると技が強化版に入れかわる（くわしくはエージェントの awaken）
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

  /* ---------- カメラ ---------- */
  camera: {
    minWidth: 1200,  // 近いときに映す横幅の最小（小さいほど寄る）。ステージ全体（幅900）と左右の空が見えるように
    padX: 360,       // 2人の間の距離に足す余白（横）
    minHeight: 300,  // 映す高さの最小
    padY: 260,       // 高さの余白
    centerPull: 0.3, // ステージの中央にどれだけ寄せるか
    zoomIn: 0.04,    // 寄るときの速さ
    zoomOut: 0.1,    // 引くときの速さ
  },

  /* ---------- ゲームのテンポ（展開の速さ） ----------
     1 = 元の速さ。全キャラに同じ割合でかかります（歩く速さは変えません） */
  tempo: {
    attack: 1.15,   // 技の出る速さとスキの短さ（1.15 = 15%速い）
    run: 1.2,       // ダッシュの速さと、走り出しの速さ
    air: 1.1,       // 空中で横に動く速さ
    fall: 1.1,      // 落ちる速さ（ジャンプの高さは変わらないように調整します）
    landLag: 0.75,  // 着地のスキ（0.75 = 25%短い）
  },

  /* ---------- 物理・システム ---------- */
  physics: {
    launchScale: 0.135,     // 吹っ飛びの強さ全体（大きいほど全員よく飛ぶ）
    kbDecay: 0.30,          // 吹っ飛んだ勢いが弱まる速さ
    hitstunMul: 0.40,       // のけぞり・吹っ飛びで操作できない時間（吹っ飛び量 × この値）
    tumbleKb: 80,           // この値より強く飛ばされると、きりもみ状態になる
    hitlagBase: 3,          // 当たった瞬間に止まる「ヒットストップ」の基本コマ数
    hitlagMul: 0.53,        // ダメージに応じて増えるヒットストップ
    groundFriction: 0.7,    // 地上での止まりやすさ
    jumpSquat: 3,           // ジャンプの踏み込み（コマ）
    shortHopRatio: 0.68,    // 小ジャンプの強さ（大ジャンプに対する割合）
    shortHopWindow: 6,      // ジャンプボタンをこのコマ数より早く離すと小ジャンプ
    fastFallMul: 1.6,       // 急降下の速さ（落下の最高速度に対する倍率）
    techWindow: 20,         // 着地の何コマ前までにシールドを押せば受け身になるか
    techLockout: 40,        // 受け身に失敗したあと、もう一度押せるまでのコマ
    downMinTime: 18,        // ダウンしてから起き上がれるまでの最短コマ
    downAutoTime: 90,       // 何もしないと自動で起き上がるまでのコマ
    shieldMax: 36,          // シールドの耐久
    shieldDrain: 0.10,      // シールドを張っている間に減る量（1コマあたり）
    shieldRegen: 0.072,      // 張っていないときに回復する量
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

  /* ---------- ステージ（見た目）：床の広さなどの数値は下の stage で全ステージ共通 ---------- */
  // platforms：すり抜け床（下からジャンプで乗れる・スティックを下にはじくと降りる）
  //   x = 横の位置（中央が0）、h = 床からの高さ、w = 幅
  stages: [
    { id: 'temple', name: '天空神殿', thumb: 'stage/temple_thumb.jpg', bgm: 'temple',
      platforms: [{ x: -235, h: 130, w: 190 }, { x: 235, h: 130, w: 190 }, { x: 0, h: 250, w: 190 }] },
    { id: 'city',   name: '摩天楼の屋上', thumb: 'stage/city_thumb.jpg', bgm: 'city',
      platforms: [{ x: -210, h: 150, w: 210 }, { x: 210, h: 150, w: 210 }] },
    { id: 'castle', name: '夜桜の古城', thumb: 'stage/castle_thumb.jpg', bgm: 'castle',
      platforms: [{ x: -250, h: 120, w: 170 }, { x: 0, h: 210, w: 230 }, { x: 250, h: 120, w: 170 }] },
  ],

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
      weak:   { name: '弱い',   reaction: 22, aggression: 0.35, shieldChance: 0.08, mistake: 0.35, techChance: 0.1, combo: 0.0, parryChance: 0.0, diSkill: 0.0 },
      normal: { name: 'ふつう', reaction: 10, aggression: 0.6,  shieldChance: 0.22, mistake: 0.12, techChance: 0.45, combo: 0.35, parryChance: 0.2, diSkill: 0.45 },
      strong: { name: '強い',   reaction: 4,  aggression: 0.8,  shieldChance: 0.38, mistake: 0.03, techChance: 0.85, combo: 0.8, parryChance: 0.45, diSkill: 0.9 },
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
                   hits: [{ f:[16,18], x:42, y:12, r:24, dmg:4.3, ang:30, bkb:65, kbg:30 },
                          { f:[16,18], x:-42, y:12, r:24, dmg:4.3, ang:150, bkb:65, kbg:30 }] },
    ledgeAttack: { name: '崖攻撃', dur: 44, invuln: [0, 20],
                   poses: [[0,'ledgeHang'],[10,'ledgeClimb'],[18,'kickWind'],[22,'kick'],[30,'kick'],[44,'idle']],
                   hits: [{ f:[22,25], x:42, y:30, r:24, dmg:6.5, ang:40, bkb:70, kbg:30 }] },
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
               hits: [{ f:[3,4], x:40, y:72, r:16, dmg:1.8, ang:20, fkb:30, react:'light' }] },
      jab2:  { name: '弱2：エルボー', dur: 20, iasa: 17, next: { key:'jab3', f:[4,16] },
               poses: [[0,'elbowWind'],[3,'elbow'],[8,'elbow'],[20,'idle']],
               hits: [{ f:[3,4], x:34, y:72, r:16, dmg:1.8, ang:20, fkb:32, react:'light' }] },
      jab3:  { name: '弱3：ヘッドバット', dur: 32, iasa: 28,
               poses: [[0,'headbuttWind'],[6,'headbutt'],[12,'headbutt'],[32,'idle']],
               hits: [{ f:[6,8], x:34, y:86, r:20, dmg:3.6, ang:70, bkb:55, kbg:30 }] }, // 弱の最後は相手を少し浮かせて、次の技につなげる
      utilt: { name: '上強：かち上げエルボー', dur: 30, iasa: 26,
               poses: [[0,'elbowUpWind'],[6,'elbowUp'],[14,'elbowUp'],[30,'idle']],
               hits: [{ f:[6,10], x:18, y:100, r:22, dmg:6.5, ang:90, bkb:45, kbg:168 },
                      { f:[6,7], x:30, y:60, r:18, dmg:5.8, ang:92, bkb:48, kbg:156 }] },
      ftilt: { name: '横強：ビッグブーツ', dur: 32, iasa: 28,
               poses: [[0,'bigBootWind'],[8,'bigBoot'],[15,'bigBoot'],[32,'idle']],
               hits: [{ f:[8,10], x:46, y:48, r:19, dmg:8.6, ang:38, bkb:35, kbg:130 }] },
      dtilt: { name: '下強：スライディング（ダウン）', dur: 34, iasa: 30,
               poses: [[0,'crouch'],[4,'slide'],[16,'slide'],[24,'crouch'],[34,'idle']],
               events: [{ f:[4,14], vx:6.5 }],
               hits: [{ f:[4,13], x:38, y:10, r:18, dmg:5.8, ang:80, bkb:45, kbg:45, react:'down' }] },

      dashAttack: { name: 'ダッシュA：ショルダータックル', dur: 42,
               poses: [[0,'dashStart'],[4,'tackle'],[17,'tackle'],[42,'idle']],
               events: [{ f:[2,14], vx:7 }],
               hits: [{ f:[5,14], x:28, y:58, r:26, dmg:7.9, ang:45, bkb:60, kbg:112 }] },

      fsmash:{ name: '横スマ：ラリアット（アーマー）', dur: 66, charge: { f:10, max:60, mul:1.4 }, armor: [4, 16],
               poses: [[0,'lariatCoil'],[10,'lariatCoil'],[13,'lariatStep'],[16,'lariatHit'],[20,'lariatHit'],[26,'lariatFollow'],[36,'lariatFollow',{t:16}],[50,'jabReady'],[66,'idle']],
               events: [{ f:15, vx:6 }],
               hits: [{ f:[16,19], x:48, y:72, r:26, dmg:17.3, ang:38, bkb:45, kbg:109 }] },
      usmash:{ name: '上スマ：真上ヘッドバット', dur: 62, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[14,'headbuttUp'],[26,'headbuttUp'],[62,'idle']],
               hits: [{ f:[14,18], x:4, y:118, r:28, dmg:14.4, ang:88, bkb:42, kbg:107 },
                      { f:[14,15], x:22, y:60, r:22, dmg:8.6, ang:90, bkb:50, kbg:84 }] },
      dsmash:{ name: '下スマ：ストンピング', dur: 60, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'stompWind'],[10,'stompWind'],[16,'stompDown'],[30,'stompDown'],[60,'idle']],
               events: [{ f:16, quake:true }],
               hits: [{ f:[16,19], x:50, y:8, r:26, dmg:13, ang:30, bkb:42, kbg:92 },
                      { f:[16,19], x:-50, y:8, r:26, dmg:13, ang:150, bkb:42, kbg:92 }] },

      nair:  { name: '空N：ボディプレス', dur: 40, landLag: 10,
               poses: [[0,'fall'],[4,'bodyPress'],[24,'bodyPress'],[40,'fall']],
               hits: [{ f:[5,8], x:5, y:40, r:36, dmg:8.6, ang:45, bkb:30, kbg:121 },
                      { f:[9,22], x:5, y:40, r:32, dmg:5, ang:45, bkb:25, kbg:92 }] },
      fair:  { name: '空前：ダブルスレッジハンマー（拳の先はメテオ）', dur: 46, landLag: 18,
               poses: [[0,'fall'],[4,'overheadWind'],[13,'overheadWind'],[16,'overheadSlam'],[28,'overheadSlam'],[46,'fall']],
               hits: [{ f:[16,17], x:46, y:28, r:16, dmg:10.8, ang:285, bkb:40, kbg:80 },
                      { f:[16,18], x:34, y:58, r:22, dmg:9.4, ang:45, bkb:35, kbg:94 }] },
      bair:  { name: '空後：ドロップキック', dur: 38, landLag: 12,
               poses: [[0,'fall'],[4,'backKickWind'],[8,'dropkick'],[18,'dropkick'],[38,'fall']],
               hits: [{ f:[8,11], x:-50, y:40, r:24, dmg:10.8, ang:140, bkb:34, kbg:116 }] },
      uair:  { name: '空上：サマーソルトキック', dur: 32, landLag: 8,
               poses: [[0,'fall',{r:0}],[4,'tuck',{r:-60}],[7,'upKick',{r:-150}],[14,'upKick',{r:-250}],[24,'tuck',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[6,10], x:0, y:110, r:26, dmg:7.9, ang:85, bkb:32, kbg:135 }] },
      dair:  { name: '空下：フットスタンプ（メテオ）', dur: 44, landLag: 22,
               poses: [[0,'fall'],[4,'tuck'],[12,'footStamp'],[24,'footStamp'],[44,'fall']],
               hits: [{ f:[12,15], x:2, y:-6, r:22, dmg:10.8, ang:270, bkb:40, kbg:75 }] },
    },

    /* ---------- 刀（狐の剣士）：小さな体で、刀の先まで届く ---------- */
    katana: {
      jab:   { name: '弱1：抜き打ち', dur: 16, iasa: 13, next: { key:'jab2', f:[3,13] },
               poses: [[0,'kReady'],[2,'kSlash'],[6,'kSlash'],[12,'kReady'],[16,'idle']],
               hits: [{ f:[2,3], x:56, y:62, r:16, dmg:1.2, ang:20, fkb:28, react:'light' }] },
      jab2:  { name: '弱2：返し斬り', dur: 17, iasa: 14, next: { key:'jab3', f:[3,14] },
               poses: [[0,'kSlash'],[3,'kRise',{tw:-0.4}],[7,'kRise'],[17,'kReady']],
               hits: [{ f:[3,4], x:42, y:86, r:18, dmg:1.2, ang:30, fkb:30, react:'light' }] },
      jab3:  { name: '弱3：諸手突き', dur: 28, iasa: 24,
               poses: [[0,'kThrustWind'],[5,'kThrust'],[12,'kThrust'],[28,'idle']],
               events: [{ f:[4,8], vx:3 }],
               hits: [{ f:[5,7], x:62, y:58, r:17, dmg:3, ang:72, bkb:52, kbg:28 }] },
      utilt: { name: '上強：三日月斬り', dur: 26, iasa: 22,
               poses: [[0,'kUpWind'],[4,'kRise'],[8,'kUpArc'],[12,'kBack',{t:-5}],[26,'idle']],
               hits: [{ f:[4,6], x:30, y:94, r:20, dmg:2.9, ang:100, fkb:42, react:'light' }, // 1段目：すくい上げ（つなぎ）
                      { f:[7,10], x:0, y:112, r:24, dmg:5, ang:88, bkb:40, kbg:202 }] },
      ftilt: { name: '横強：横一文字', dur: 28, iasa: 24,
               poses: [[0,'kSlashWind'],[6,'kSlash',{tw:0.8}],[13,'kSlash'],[28,'idle']],
               hits: [{ f:[6,8], x:64, y:64, r:15, dmg:6.5, ang:38, bkb:32, kbg:161 },
                      { f:[6,8], x:42, y:62, r:14, dmg:5, ang:40, bkb:30, kbg:143 }] },
      dtilt: { name: '下強：すね斬り（ダウン）', dur: 22, iasa: 18,
               poses: [[0,'kLowWind'],[5,'kLowSweep'],[12,'kLowSweep'],[22,'crouch']],
               hits: [{ f:[5,7], x:58, y:10, r:17, dmg:4.3, ang:80, bkb:40, kbg:45, react:'down' }] },

      dashAttack: { name: 'ダッシュA：駆け抜け一閃', dur: 34,
               poses: [[0,'kLowWind'],[4,'kSlashLow',{tw:1}],[14,'kSlashLow'],[34,'kReady']],
               events: [{ f:[0,10], vx:8 }],
               hits: [{ f:[3,10], x:38, y:40, r:28, dmg:5.8, ang:40, bkb:60, kbg:133 }] },

      fsmash:{ name: '横スマ：居合・一閃（刀の先が強い）', dur: 58, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'iaiWind'],[10,'iaiWind'],[14,'iaiSlash'],[26,'iaiSlash'],[58,'kReady']],
               events: [{ f:[12,15], vx:7 }],
               hits: [{ f:[14,15], x:76, y:50, r:13, dmg:14.4, ang:38, bkb:44, kbg:118 },
                      { f:[14,15], x:50, y:48, r:17, dmg:10.8, ang:40, bkb:38, kbg:101 }] },
      usmash:{ name: '上スマ：天月（てんげつ）', dur: 54, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'kUpWind'],[8,'kUpWind'],[12,'kRise'],[16,'kUpArc'],[22,'kBack',{t:-10}],[54,'idle']],
               hits: [{ f:[12,14], x:32, y:96, r:22, dmg:9.8, ang:88, bkb:42, kbg:146 },
                      { f:[15,19], x:0, y:116, r:26, dmg:10.4, ang:90, bkb:42, kbg:149 }] },
      dsmash:{ name: '下スマ：前後払い', dur: 54, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'kLowWind',{yw:0}],[8,'kLowWind',{yw:0}],[11,'kLowSweep',{yw:0}],[15,'kLowSweep',{yw:180}],[19,'kLowSweep',{yw:360}],[54,'idle',{yw:360}]],
               hits: [{ f:[11,13], x:58, y:10, r:18, dmg:9.4, ang:30, bkb:38, kbg:115 },
                      { f:[16,18], x:-58, y:10, r:18, dmg:10.1, ang:150, bkb:38, kbg:117 }] },

      nair:  { name: '空N：旋風斬り', dur: 32, landLag: 7,
               poses: [[0,'fall',{r:0}],[3,'kSlash',{r:0}],[15,'kSlash',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[4,8], x:30, y:45, r:30, dmg:5.8, ang:45, bkb:30, kbg:158 },
                      { f:[9,14], x:-30, y:45, r:26, dmg:3.6, ang:135, bkb:25, kbg:118 }] },
      fair:  { name: '空前：袈裟斬り', dur: 30, landLag: 8,
               poses: [[0,'fall'],[3,'kSlashWind'],[7,'kSlash'],[11,'kSlashLow'],[30,'fall']],
               hits: [{ f:[7,10], x:54, y:56, r:22, dmg:6.5, ang:45, bkb:30, kbg:174 }] },
      bair:  { name: '空後：背面斬り', dur: 32, landLag: 9,
               poses: [[0,'fall'],[3,'kReady'],[7,'kBack'],[16,'kBack'],[32,'fall']],
               hits: [{ f:[7,9], x:-52, y:58, r:20, dmg:7.9, ang:140, bkb:32, kbg:154 }] },
      uair:  { name: '空上：月面宙返り', dur: 30, landLag: 7,
               poses: [[0,'fall',{r:0}],[3,'tuck',{r:-60}],[6,'kUpArc',{r:-150}],[13,'kUpArc',{r:-250}],[22,'tuck',{r:-360}],[30,'fall',{r:-360}]],
               hits: [{ f:[5,10], x:0, y:104, r:24, dmg:5.8, ang:85, bkb:32, kbg:174 }] },
      dair:  { name: '空下：下段突き（メテオ）', dur: 38, landLag: 14,
               poses: [[0,'fall'],[4,'tuck'],[10,'kDownThrust'],[20,'kDownThrust'],[38,'fall']],
               hits: [{ f:[10,13], x:6, y:-4, r:17, dmg:8.6, ang:275, bkb:28, kbg:72 }] },
    },

    /* ---------- スパイ道具（エージェント）：通常技は体術、必殺技は道具 ---------- */
    gadget: {
      jab:   { name: '弱1：ジャブ', dur: 17, iasa: 14, next: { key:'jab2', f:[3,13] },
               poses: [[0,'jabReady'],[2,'punch'],[6,'punch'],[12,'jabReady'],[17,'idle']],
               hits: [{ f:[2,3], x:44, y:72, r:15, dmg:1.5, ang:20, fkb:28, react:'light' }] },
      jab2:  { name: '弱2：ストレート', dur: 19, iasa: 16, next: { key:'jab3', f:[4,15] },
               poses: [[0,'jabReady'],[3,'punch2'],[7,'punch2'],[19,'idle']],
               hits: [{ f:[3,4], x:40, y:70, r:16, dmg:1.5, ang:20, fkb:30, react:'light' }] },
      jab3:  { name: '弱3：ハイキック', dur: 30, iasa: 26,
               poses: [[0,'kickWind'],[5,'roundKick'],[11,'roundKick'],[30,'idle']],
               hits: [{ f:[5,7], x:46, y:58, r:20, dmg:3, ang:70, bkb:52, kbg:30 }] },
      utilt: { name: '上強：振り上げキック', dur: 28, iasa: 24,
               poses: [[0,'kickWind'],[5,'upKick'],[12,'upKick'],[28,'idle']],
               hits: [{ f:[5,9], x:16, y:92, r:22, dmg:5.8, ang:88, bkb:40, kbg:192 }] },
      ftilt: { name: '横強：ピンヒールキック', dur: 30, iasa: 26,
               poses: [[0,'kickWind'],[7,'kick'],[14,'kick'],[30,'idle']],
               hits: [{ f:[7,9], x:50, y:50, r:16, dmg:7.2, ang:38, bkb:32, kbg:157 },
                      { f:[7,9], x:28, y:50, r:14, dmg:5.8, ang:40, bkb:30, kbg:139 }] },
      dtilt: { name: '下強：足払い（ダウン）', dur: 22, iasa: 18,
               poses: [[0,'sweepWind'],[5,'sweep'],[12,'sweep'],[22,'crouch']],
               hits: [{ f:[5,7], x:48, y:12, r:18, dmg:4.3, ang:80, bkb:40, kbg:45, react:'down' }] },

      dashAttack: { name: 'ダッシュA：飛び膝蹴り', dur: 36,
               poses: [[0,'dashStart'],[4,'kneeStrike'],[14,'kneeStrike'],[36,'idle']],
               events: [{ f:[2,12], vx:6.5 }],
               hits: [{ f:[5,11], x:26, y:64, r:22, dmg:6.5, ang:55, bkb:60, kbg:154 }] },

      fsmash:{ name: '横スマ：後ろ回し蹴り', dur: 60, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'kickWind',{yw:0}],[10,'kickWind',{yw:0}],[13,'roundKick',{yw:200}],[16,'roundKick',{yw:360}],[30,'roundKick',{yw:360}],[60,'idle',{yw:360}]],
               hits: [{ f:[15,18], x:50, y:58, r:22, dmg:13, ang:38, bkb:42, kbg:141 }] },
      usmash:{ name: '上スマ：天空ハイキック', dur: 56, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[12,'upKick'],[26,'upKick'],[56,'idle']],
               hits: [{ f:[12,16], x:12, y:100, r:26, dmg:11.5, ang:88, bkb:42, kbg:128 },
                      { f:[12,13], x:24, y:50, r:20, dmg:7.2, ang:90, bkb:48, kbg:103 }] },
      dsmash:{ name: '下スマ：開脚キック', dur: 56, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'crouch'],[8,'crouch'],[12,'splitKick'],[24,'splitKick'],[56,'idle']],
               hits: [{ f:[12,15], x:44, y:8, r:20, dmg:10.1, ang:30, bkb:40, kbg:115 },
                      { f:[12,15], x:-44, y:8, r:20, dmg:10.1, ang:150, bkb:40, kbg:115 }] },

      nair:  { name: '空N：開脚旋回キック', dur: 34, landLag: 8,
               poses: [[0,'fall'],[4,'nairSpread'],[20,'nairSpread'],[34,'fall']],
               hits: [{ f:[5,8], x:40, y:30, r:24, dmg:6.5, ang:45, bkb:30, kbg:147 },
                      { f:[5,8], x:-40, y:30, r:24, dmg:6.5, ang:135, bkb:30, kbg:147 },
                      { f:[9,18], x:0, y:30, r:40, dmg:3.6, ang:45, bkb:25, kbg:109 }] },
      fair:  { name: '空前：前蹴り', dur: 32, landLag: 9,
               poses: [[0,'fall'],[3,'kickWind'],[7,'kick'],[16,'kick'],[32,'fall']],
               hits: [{ f:[7,10], x:48, y:48, r:19, dmg:7.2, ang:45, bkb:30, kbg:157 }] },
      bair:  { name: '空後：ヒールバック', dur: 34, landLag: 10,
               poses: [[0,'fall'],[3,'backKickWind'],[7,'backKick'],[16,'backKick'],[34,'fall']],
               hits: [{ f:[7,9], x:-48, y:46, r:20, dmg:8.6, ang:140, bkb:32, kbg:139 }] },
      uair:  { name: '空上：サマーソルト', dur: 32, landLag: 8,
               poses: [[0,'fall',{r:0}],[4,'tuck',{r:-60}],[7,'upKick',{r:-150}],[14,'upKick',{r:-250}],[24,'tuck',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[6,10], x:0, y:106, r:26, dmg:6.5, ang:85, bkb:32, kbg:161 }] },
      dair:  { name: '空下：かかと落とし（メテオ）', dur: 40, landLag: 15,
               poses: [[0,'fall'],[4,'heelDrop'],[11,'heelDropDown'],[22,'heelDropDown'],[40,'fall']],
               hits: [{ f:[11,14], x:22, y:2, r:18, dmg:8.6, ang:280, bkb:30, kbg:72 }] },
    },

    /* ---------- 弓（中国の伝説的な弓の名手：弓使い） ---------- */
    bow: {
      jab:   { name: '弱1：弓先突き', dur: 17, iasa: 14, next: { key:'jab2', f:[3,13] },
               poses: [[0,'jabReady'],[2,'bowJab'],[6,'bowJab'],[12,'jabReady'],[17,'idle']],
               hits: [{ f:[2,3], x:44, y:66, r:15, dmg:1.5, ang:20, fkb:28, react:'light' }] },
      jab2:  { name: '弱2：掌打', dur: 19, iasa: 16, next: { key:'jab3', f:[4,15] },
               poses: [[0,'jabReady'],[3,'palm'],[7,'palm'],[19,'idle']],
               hits: [{ f:[3,4], x:36, y:68, r:16, dmg:1.5, ang:20, fkb:30, react:'light' }] },
      jab3:  { name: '弱3：弓払い', dur: 30, iasa: 26,
               poses: [[0,'bowSweepWind'],[5,'bowSweep'],[11,'bowSweep'],[30,'idle']],
               hits: [{ f:[5,7], x:52, y:60, r:22, dmg:3, ang:72, bkb:52, kbg:28 }] },
      utilt: { name: '上強：弓旋回', dur: 30, iasa: 25,
               poses: [[0,'bowSpinUp',{wr:0}],[6,'bowSpinUp',{wr:200}],[14,'bowSpinUp',{wr:560}],[30,'idle',{wr:720}]],
               hits: [{ f:[6,8], x:40, y:95, r:22, dmg:2.2, ang:96, fkb:40, react:'light' }, // 1〜2段目：巻き込み（つなぎ）
                      { f:[9,11], x:0, y:120, r:24, dmg:2.2, ang:90, fkb:36, react:'light' },
                      { f:[12,14], x:0, y:118, r:30, dmg:5, ang:90, bkb:42, kbg:202 }] },
      ftilt: { name: '横強：側踹（そくたん）', dur: 30, iasa: 26,
               poses: [[0,'sideKickWind'],[7,'sideKick'],[14,'sideKick'],[30,'idle']],
               hits: [{ f:[7,9], x:58, y:50, r:17, dmg:7.2, ang:38, bkb:32, kbg:153 },
                      { f:[7,9], x:34, y:50, r:15, dmg:5.8, ang:40, bkb:30, kbg:135 }] },
      dtilt: { name: '下強：足元払い（ダウン）', dur: 22, iasa: 18,
               poses: [[0,'swingLowWind'],[5,'swingLow'],[12,'swingLow'],[22,'crouch']],
               hits: [{ f:[5,7], x:60, y:8, r:17, dmg:4.3, ang:80, bkb:40, kbg:45, react:'down' }] },

      dashAttack: { name: 'ダッシュA：スライディング蹴り', dur: 38,
               poses: [[0,'crouch'],[3,'slide'],[16,'slide'],[24,'crouch'],[38,'idle']],
               events: [{ f:[3,16], vx:7 }],
               hits: [{ f:[4,14], x:36, y:12, r:20, dmg:5.8, ang:75, bkb:65, kbg:155 }] },

      fsmash:{ name: '横スマ：弓棍・全力振り', dur: 62, charge: { f:9, max:60, mul:1.4 },
               poses: [[0,'staffWind'],[9,'staffWind'],[15,'staffSwing'],[28,'staffSwing'],[62,'idle']],
               events: [{ f:14, vx:4 }],
               hits: [{ f:[15,17], x:72, y:62, r:18, dmg:13.7, ang:38, bkb:42, kbg:127 },
                      { f:[15,17], x:40, y:62, r:20, dmg:10.8, ang:40, bkb:38, kbg:112 }] },
      usmash:{ name: '上スマ：三連天矢', dur: 58, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'aimUp'],[8,'aimUp'],[13,'releaseUp'],[28,'releaseUp'],[58,'idle']],
               hits: [{ f:[12,14], x:10, y:95, r:24, dmg:10.1, ang:90, bkb:50, kbg:135 }], // 至近距離は弓の一撃（矢はその外の相手に当たる）
               events: [{ f:13, proj:'arrow', noDouble:true, ang:80, x:0, y:95, speed:18, dmg:4.3, kang:88, bkb:40, kbg:144 },
                        { f:13, proj:'arrow', noDouble:true, ang:90, x:0, y:95, speed:18, dmg:4.3, kang:88, bkb:40, kbg:144 },
                        { f:13, proj:'arrow', noDouble:true, ang:100, x:0, y:95, speed:18, dmg:4.3, kang:88, bkb:40, kbg:144 }] },
      dsmash:{ name: '下スマ：回旋脚', dur: 58, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'plantWind',{yw:0}],[8,'plantWind',{yw:0}],[12,'plantKick',{yw:0}],[16,'plantKick',{yw:180}],[22,'plantKick',{yw:360}],[58,'idle',{yw:360}]],
               hits: [{ f:[12,14], x:55, y:12, r:22, dmg:10.8, ang:30, bkb:40, kbg:112 },
                      { f:[17,19], x:-55, y:12, r:22, dmg:10.8, ang:150, bkb:40, kbg:112 }] },

      nair:  { name: '空N：旋風脚', dur: 36, landLag: 8,
               poses: [[0,'fall',{yw:0}],[4,'tornadoKick',{yw:0}],[18,'tornadoKick',{yw:720}],[36,'fall',{yw:720}]],
               hits: [{ f:[5,9], x:40, y:45, r:26, dmg:3.6, ang:100, fkb:34, react:'light' }, // つなぎ：内側に寄せる
                      { f:[5,9], x:-40, y:45, r:26, dmg:3.6, ang:80, fkb:34, react:'light' },
                      { f:[12,16], x:0, y:45, r:44, dmg:4.3, ang:45, bkb:38, kbg:183, rehit:4 }] },
      fair:  { name: '空前：弓振り下ろし', dur: 34, landLag: 10,
               poses: [[0,'fall'],[3,'overheadWind'],[9,'swingFwd'],[16,'swingFwd'],[34,'fall']],
               hits: [{ f:[9,11], x:52, y:48, r:21, dmg:7.2, ang:50, bkb:32, kbg:161 }] },
      bair:  { name: '空後：振り向き後ろ蹴り', dur: 34, landLag: 11,
               poses: [[0,'fall'],[3,'backKickWind'],[7,'backKick'],[16,'backKick'],[34,'fall']],
               hits: [{ f:[7,9], x:-54, y:40, r:21, dmg:9.4, ang:140, bkb:32, kbg:129 }] },
      uair:  { name: '空上：宙返り蹴り', dur: 32, landLag: 8,
               poses: [[0,'fall',{r:0}],[4,'tuck',{r:-60}],[7,'upKick',{r:-150}],[14,'upKick',{r:-250}],[24,'tuck',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[6,10], x:0, y:108, r:26, dmg:6.5, ang:85, bkb:32, kbg:161 }] },
      dair:  { name: '空下：落星（メテオ）', dur: 40, landLag: 14,
               poses: [[0,'fall'],[4,'aimDown'],[11,'releaseDown'],[40,'fall']],
               events: [{ f:11, proj:'arrow', ang:-90, x:0, y:20, speed:20, dmg:6.5, kang:270, bkb:40, kbg:70 }, { f:11, vy:5 }] },
    },

    /* ---------- メカ（ロボ）：重くて大きい。一発一発が重い ---------- */
    mech: {
      jab:   { name: '弱1：ジャブ', dur: 18, iasa: 15, next: { key:'jab2', f:[4,14] },
               poses: [[0,'jabReady'],[3,'punch'],[7,'punch'],[18,'idle']],
               hits: [{ f:[3,4], x:48, y:76, r:20, dmg:1.8, ang:20, fkb:32, react:'light' }] },
      jab2:  { name: '弱2：ストレート', dur: 20, iasa: 17, next: { key:'jab3', f:[4,16] },
               poses: [[0,'punch'],[3,'punch2'],[8,'punch2'],[20,'idle']],
               hits: [{ f:[3,4], x:50, y:74, r:20, dmg:1.8, ang:20, fkb:34, react:'light' }] },
      jab3:  { name: '弱3：ブーストアッパー', dur: 34, iasa: 30,
               poses: [[0,'uppercutWind'],[6,'uppercut'],[14,'uppercut'],[34,'idle']],
               hits: [{ f:[6,8], x:40, y:96, r:22, dmg:3.6, ang:72, bkb:55, kbg:28 }] },
      ftilt: { name: '横強：アームハンマー', dur: 32, iasa: 28,
               poses: [[0,'rocketWind'],[8,'rocketPunch',{tw:0.6}],[15,'rocketPunch'],[32,'idle']],
               events: [{ f:[6,9], vx:3 }],
               hits: [{ f:[8,10], x:56, y:78, r:22, dmg:8.6, ang:38, bkb:35, kbg:135 }, { f:[8,10], x:46, y:42, r:20, dmg:8.6, ang:38, bkb:35, kbg:135 }] }, // 下の判定：小さい相手にも当たる
      utilt: { name: '上強：ジェットアッパー', dur: 32, iasa: 28,
               poses: [[0,'uppercutWind'],[6,'uppercut'],[14,'uppercut'],[32,'idle']],
               hits: [{ f:[6,10], x:24, y:118, r:26, dmg:7.2, ang:88, bkb:42, kbg:165 }] },
      dtilt: { name: '下強：ローキック', dur: 26, iasa: 22,
               poses: [[0,'sweepWind'],[6,'sweep'],[12,'sweep'],[26,'crouch']],
               hits: [{ f:[6,8], x:50, y:12, r:20, dmg:5.8, ang:75, bkb:45, kbg:40 }] },

      dashAttack: { name: 'ダッシュA：ブーストショルダー', dur: 44,
               poses: [[0,'dashStart'],[4,'tackle'],[18,'tackle'],[44,'idle']],
               events: [{ f:[2,16], vx:8 }],
               hits: [{ f:[5,15], x:34, y:64, r:31, dmg:8.6, ang:45, bkb:60, kbg:108 }] },

      fsmash:{ name: '横スマ：ロケットパンチ', dur: 66, charge: { f:12, max:60, mul:1.4 },
               poses: [[0,'rocketWind'],[12,'rocketWind'],[17,'rocketPunch'],[32,'rocketPunch'],[66,'idle']],
               events: [{ f:16, vx:7 }, { f:17, blast:{ x:70, y:80, col:'#8fe6ff' } }],
               hits: [{ f:[17,20], x:62, y:80, r:26, dmg:17.3, ang:38, bkb:44, kbg:108 }] },
      usmash:{ name: '上スマ：スラスターアッパー', dur: 62, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[10,'smashUpWind'],[15,'smashUp'],[28,'smashUp'],[62,'idle']],
               hits: [{ f:[15,19], x:10, y:136, r:30, dmg:14.4, ang:88, bkb:42, kbg:105 },
                      { f:[15,16], x:30, y:70, r:24, dmg:8.6, ang:92, bkb:50, kbg:77 }] },
      dsmash:{ name: '下スマ：グラウンドパウンド', dur: 64, charge: { f:12, max:60, mul:1.4 },
               poses: [[0,'poundWind'],[12,'poundWind'],[18,'pound'],[32,'pound'],[64,'idle']],
               events: [{ f:18, quake:true }],
               hits: [{ f:[18,21], x:56, y:10, r:28, dmg:13.7, ang:30, bkb:42, kbg:88 },
                      { f:[18,21], x:-56, y:10, r:28, dmg:13.7, ang:150, bkb:42, kbg:88 }] },

      nair:  { name: '空N：スピンアーム', dur: 40, landLag: 12,
               poses: [[0,'fall',{yw:0}],[4,'nairSpread',{yw:0}],[20,'nairSpread',{yw:720}],[40,'fall',{yw:720}]],
               hits: [{ f:[5,9], x:0, y:62, r:40, dmg:7.9, ang:45, bkb:30, kbg:131 },
                      { f:[10,20], x:0, y:62, r:36, dmg:5, ang:45, bkb:25, kbg:102 }] },
      fair:  { name: '空前：ハンマーナックル', dur: 44, landLag: 16,
               poses: [[0,'fall'],[4,'overheadWind'],[12,'overheadWind'],[15,'overheadSlam'],[26,'overheadSlam'],[44,'fall']],
               hits: [{ f:[15,18], x:46, y:50, r:26, dmg:10.1, ang:45, bkb:35, kbg:119 }] },
      bair:  { name: '空後：ジェットキック', dur: 38, landLag: 12,
               poses: [[0,'fall'],[4,'backKickWind'],[8,'backKick'],[18,'backKick'],[38,'fall']],
               events: [{ f:8, blast:{ x:-20, y:70, col:'#8fe6ff' } }],
               hits: [{ f:[8,11], x:-54, y:50, r:26, dmg:10.8, ang:140, bkb:34, kbg:122 }] },
      uair:  { name: '空上：アームアッパー', dur: 34, landLag: 9,
               poses: [[0,'fall'],[4,'smashUpWind'],[8,'smashUp'],[18,'smashUp'],[34,'fall']],
               hits: [{ f:[8,12], x:6, y:130, r:28, dmg:7.9, ang:86, bkb:32, kbg:139 }] },
      dair:  { name: '空下：ヘビースタンプ（メテオ）', dur: 46, landLag: 22,
               poses: [[0,'fall'],[4,'tuck'],[12,'footStamp'],[26,'footStamp'],[46,'fall']],
               hits: [{ f:[12,16], x:2, y:-8, r:26, dmg:11.5, ang:270, bkb:40, kbg:75 }] },
    },

    /* ---------- ツメ（猫）：4本足。小さくて速い。氷の姿の通常技（炎の姿は強い技だけ入れかわる） ---------- */
    claw: {
      jab:   { name: '弱1：ねこパンチ', dur: 13, iasa: 10, next: { key:'jab2', f:[3,11] },
               poses: [[0,'q_swipeWind'],[2,'q_swipe'],[6,'q_swipe'],[13,'q_idle']],
               hits: [{ f:[2,3], x:24, y:26, r:14, dmg:1.2, ang:25, fkb:26, react:'light' }] },
      jab2:  { name: '弱2：ねこパンチ（逆の手）', dur: 13, iasa: 10, next: { key:'jab3', f:[3,11] },
               poses: [[0,'q_swipe'],[2,'q_swipe2'],[6,'q_swipe2'],[13,'q_idle']],
               hits: [{ f:[2,3], x:24, y:26, r:14, dmg:1.2, ang:25, fkb:28, react:'light' }] },
      jab3:  { name: '弱3：とびつき引っかき', dur: 26, iasa: 22,
               poses: [[0,'q_pounceW'],[4,'q_pounce'],[10,'q_pounce'],[26,'q_idle']],
               events: [{ f:[3,8], vx:3 }],
               hits: [{ f:[4,6], x:24, y:22, r:16, dmg:2.4, ang:72, bkb:50, kbg:26 }] },
      ftilt: { name: '横強：氷のツメ', dur: 24, iasa: 20,
               poses: [[0,'q_swipeWind'],[5,'q_swipe',{fa1:92}],[10,'q_swipe'],[24,'q_idle']],
               events: [{ f:[3,6], vx:2.5 }],
               hits: [{ f:[5,7], x:30, y:24, r:16, dmg:5.8, ang:40, bkb:32, kbg:182 }] },
      utilt: { name: '上強：しっぽ払い', dur: 24, iasa: 20,
               poses: [[0,'q_idle',{yw:0}],[3,'q_tailSpin',{yw:120}],[8,'q_tailSpin',{yw:360,wr:110}],[24,'q_idle',{yw:360}]],
               hits: [{ f:[4,9], x:-6, y:44, r:20, dmg:4.3, ang:92, bkb:40, kbg:220 }] },
      dtilt: { name: '下強：足もと払い（つなぎ技）', dur: 18, iasa: 13,
               poses: [[0,'q_swipeLowW'],[3,'q_swipeLow'],[8,'q_swipeLow'],[18,'q_crouch']],
               hits: [{ f:[3,5], x:26, y:6, r:14, dmg:3.6, ang:76, bkb:46, kbg:24 }] }, // 低く浮かせて、横強・NB・横Bにつながる

      dashAttack: { name: 'ダッシュA：すべりこみ', dur: 32,
               poses: [[0,'q_pounceW'],[3,'q_pounce'],[14,'q_pounce'],[22,'q_crouch'],[32,'q_idle']],
               events: [{ f:[1,12], vx:7 }],
               hits: [{ f:[3,10], x:20, y:16, r:18, dmg:5, ang:55, bkb:55, kbg:186 }] },

      fsmash:{ name: '横スマ：氷柱（つらら）クロー', dur: 50, charge: { f:9, max:60, mul:1.4 }, elem: 'ice',
               poses: [[0,'q_rear'],[9,'q_rear'],[13,'q_rearSlam'],[24,'q_rearSlam'],[50,'q_idle']],
               events: [{ f:12, vx:4 }],
               hits: [{ f:[13,15], x:30, y:22, r:20, dmg:10.8, ang:38, bkb:40, kbg:157 }] },
      usmash:{ name: '上スマ：アイススパイク', dur: 48, charge: { f:8, max:60, mul:1.4 }, elem: 'ice',
               poses: [[0,'q_upClawW'],[8,'q_upClawW'],[12,'q_stretchUp'],[22,'q_stretchUp'],[48,'q_idle']],
               hits: [{ f:[12,15], x:6, y:52, r:22, dmg:9.4, ang:88, bkb:40, kbg:157 }] },
      dsmash:{ name: '下スマ：フロストリング', dur: 50, charge: { f:8, max:60, mul:1.4 }, elem: 'ice',
               poses: [[0,'q_crouch',{yw:0}],[8,'q_crouch',{yw:0}],[12,'q_tailSpin',{yw:180}],[18,'q_tailSpin',{yw:360}],[50,'q_idle',{yw:360}]],
               hits: [{ f:[12,15], x:28, y:8, r:18, dmg:8.6, ang:30, bkb:40, kbg:136 },
                      { f:[12,15], x:-28, y:8, r:18, dmg:8.6, ang:150, bkb:40, kbg:136 }] },

      nair:  { name: '空N：くるくるボール', dur: 30, landLag: 7,
               poses: [[0,'q_fall',{r:0}],[3,'q_ball',{r:-120}],[12,'q_ball',{r:-480}],[22,'q_ball',{r:-720}],[30,'q_fall',{r:-720}]],
               hits: [{ f:[4,6], x:0, y:22, r:24, dmg:5.8, ang:45, bkb:32, kbg:161 },
                      { f:[7,16], x:0, y:22, r:22, dmg:3.6, ang:45, bkb:28, kbg:119 }] },
      fair:  { name: '空前：両手引っかき', dur: 30, landLag: 8,
               poses: [[0,'q_fall'],[3,'q_swipeWind'],[6,'q_swipe'],[10,'q_swipe2'],[18,'q_swipe2'],[30,'q_fall']],
               hits: [{ f:[6,7], x:24, y:20, r:16, dmg:2.9, ang:60, fkb:35, react:'light' },
                      { f:[10,12], x:26, y:20, r:18, dmg:5, ang:42, bkb:34, kbg:196 }] },
      bair:  { name: '空後：ねこキック', dur: 30, landLag: 9,
               poses: [[0,'q_fall'],[3,'q_kickWind'],[7,'q_bunnyKick'],[16,'q_bunnyKick'],[30,'q_fall']],
               hits: [{ f:[7,10], x:-26, y:20, r:18, dmg:7.2, ang:140, bkb:32, kbg:174 }] },
      uair:  { name: '空上：宙返り引っかき', dur: 28, landLag: 7,
               poses: [[0,'q_fall',{r:0}],[3,'q_ball',{r:-90}],[6,'q_stretchUp',{r:-180}],[14,'q_stretchUp',{r:-300}],[22,'q_ball',{r:-360}],[28,'q_fall',{r:-360}]],
               hits: [{ f:[5,9], x:0, y:46, r:20, dmg:5, ang:85, bkb:32, kbg:197 }] },
      dair:  { name: '空下：ドリルキック', dur: 36, landLag: 14,
               poses: [[0,'q_fall'],[3,'q_diveDown',{yw:0}],[18,'q_diveDown',{yw:900}],[28,'q_diveDown',{yw:1080}],[36,'q_fall',{yw:1080}]],
               hits: [{ f:[4,15], x:2, y:-2, r:16, dmg:1.1, ang:85, fkb:18, rehit:3, react:'light' },
                      { f:[17,19], x:2, y:-2, r:18, dmg:2.9, ang:280, bkb:30, kbg:60 }] },
    },

  },

  /* ---------- つかみ・投げ（全キャラ共通。キャラごとに変えたい場合は overrides で） ---------- */
  throws: {
    grab:   { name: 'つかみ', dur: 30, poses: [[0,'idle'],[5,'grab'],[14,'grab'],[30,'idle']],
              hits: [{ f:[6,9], x:40, y:55, r:20, grab:true }] },
    fthrow: { name: '前投げ', dur: 26, release: 10, poses: [[0,'hold'],[8,'throwFwd',{tw:0.8}],[26,'idle']],
              held: [[0,36,0],[8,48,10]], hit: { dmg:5.8, ang:40, bkb:55, kbg:60 } },
    bthrow: { name: '後ろ投げ', dur: 32, release: 12, poses: [[0,'hold'],[10,'throwFwd',{tw:0.8}],[32,'idle']],
              events: [{ f:0, turn:true }],
              held: [[0,-36,0],[6,-10,40],[11,44,15]], hit: { dmg:7.2, ang:42, bkb:60, kbg:70 } },
    uthrow: { name: '上投げ', dur: 30, release: 12, poses: [[0,'hold'],[11,'throwUp'],[30,'idle']],
              held: [[0,36,0],[11,5,105]], hit: { dmg:5, ang:90, bkb:65, kbg:70 } },
    dthrow: { name: '下投げ', dur: 32, release: 13, poses: [[0,'hold'],[12,'throwDown'],[32,'idle']],
              held: [[0,36,0],[12,34,-2]], hit: { dmg:4.3, ang:80, bkb:55, kbg:35 } },
  },

  /* =====================================================================
     キャラクター（今は代表の4体）
     specials: B（必殺技）。地上4種 + 空中5種 = 9種、すべて別の技。ためはありません
     overrides: 共通技をこのキャラだけ変えたいときに使う
       例）overrides: { jab: { hits: [{ dmg: 3.6 }] } } … このキャラの弱1だけダメージ5に
     ===================================================================== */
  characters: [

    /* ===== 1：拳闘士（近距離・パワー・プロレスラー） ===== */
    {
      id: 'fist', no: 1, name: '拳闘士', range: '近距離', type: 'パワー', weapon: 'unarmed',
      portrait: 'face_fist.jpg', // キャラ選択の絵
      model: 'wrestler.glb', // 3Dモデル（Higgsfieldで作成）
      stats: { weight: 125, walk: 2.8, run: 5.0, air: 3.2, airAccel: 0.32, jump: 13.8, djump: 12.8,
               gravity: 0.66, fall: 11, airJumps: 1, dmgMul: 1.13, kbMul: 1.0, speed: 0.92 },
      look: { thick: 9.5, head: 11.5, gaze: { pitch: 10 } }, // gaze：目線のクセ（pitch：あごを上げる角度、tilt：首のかしげ）
      cpu: { style: 'rush', range: 55, cgrab: true },
      specials: {
        /* --- 地上 --- */
        n:    { name: 'NB：剛腕チョップ（アーマー）', dur: 60, armor: [3, 17],
                poses: [[0,'chopBigWind'],[12,'chopBigWind'],[18,'chopBig'],[32,'chopBig'],[60,'idle']],
                events: [{ f:17, vx:5 }],
                hits: [{ f:[18,21], x:46, y:62, r:25, dmg:13, ang:40, bkb:45, kbg:85 }] },
        side: { name: '横B：ローリングプレス（つかみ）', dur: 54,
                poses: [[0,'crouch'],[6,'leapGrab'],[20,'leapGrab'],[30,'crouch'],[54,'idle']],
                events: [{ f:6, vy:6 }, { f:[6,20], vx:8 }],
                hits: [{ f:[7,20], x:40, y:45, r:26, cgrab:'sspecialHit' }] },
        up:   { name: '上B：サイクロンアッパー', dur: 48, helpless: true, landLag: 20,
                poses: [[0,'uppercutWind',{yw:0}],[4,'uppercut',{yw:0}],[22,'uppercut',{yw:1080}],[30,'uppercut',{yw:1080}],[48,'helpless',{yw:1080}]],
                events: [{ f:[4,20], vy:12, vx:2 }, { f:21, vy:2 }],
                gravityFrames: [0,21],
                hits: [{ f:[4,18], x:8, y:100, r:16, dmg:1.4, ang:88, bkb:20, kbg:8, rehit:4, react:'light' },
                       { f:[19,21], x:8, y:105, r:20, dmg:4.3, ang:80, bkb:55, kbg:75, rehit:2 }] },
        down: { name: '下B：スリーパーホールド（つかみ）', dur: 46,
                poses: [[0,'jabReady'],[6,'grab'],[12,'grab'],[46,'idle']],
                hits: [{ f:[7,10], x:32, y:60, r:18, cgrab:'dspecialHit' }] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中剛腕チョップ', dur: 50, landLag: 16, gravityMul: 0.5,
                poses: [[0,'chopBigWind'],[10,'chopBigWind'],[16,'chopBig'],[28,'chopBig'],[50,'fall']],
                hits: [{ f:[16,19], x:46, y:58, r:24, dmg:10.8, ang:40, bkb:42, kbg:116 }] },
        airF: { name: '空中前B：フライングボディアタック', dur: 44, landLag: 16, oncePerAir: true, gravityMul: 0.15,
                poses: [[0,'tuck'],[6,'bodyAttack'],[24,'bodyAttack'],[44,'fall']],
                events: [{ f:0, vy:2 }, { f:[6,24], vx:10 }],
                hits: [{ f:[6,24], x:30, y:50, r:28, dmg:8.6, ang:45, bkb:40, kbg:152 }] },
        airB: { name: '空中後B：振り向きバックハンド', dur: 40, landLag: 14,
                poses: [[0,'chopWind'],[10,'backhand'],[22,'backhand'],[40,'fall']],
                events: [{ f:3, turn:true }],
                hits: [{ f:[10,13], x:48, y:62, r:22, dmg:10.8, ang:40, bkb:40, kbg:145 }] },
        airU: { name: '空中上B：サイクロンアッパー', dur: 48, helpless: true, landLag: 20,
                poses: [[0,'uppercutWind',{yw:0}],[4,'uppercut',{yw:0}],[22,'uppercut',{yw:1080}],[30,'uppercut',{yw:1080}],[48,'helpless',{yw:1080}]],
                events: [{ f:[4,20], vy:13.5, vx:3 }, { f:21, vy:2 }],
                gravityFrames: [0,21],
                hits: [{ f:[4,18], x:8, y:100, r:16, dmg:1.4, ang:88, bkb:20, kbg:8, rehit:4, react:'light' },
                       { f:[19,21], x:8, y:105, r:20, dmg:4.3, ang:80, bkb:55, kbg:75, rehit:2 }] },
        airD: { name: '空中下B：ダイビングエルボー（メテオ）', dur: 70, landLag: 26, helpless: true,
                poses: [[0,'tuck'],[8,'divingElbow'],[70,'divingElbow']],
                events: [{ f:0, vy:5 }, { f:[9,69], vy:-17, vx:0 }],
                gravityFrames: [0,70],
                landSpawn: [{ proj:'shock', dir:1 }, { proj:'shock', dir:-1 }],
                hits: [{ f:[9,69], x:6, y:15, r:24, dmg:9.4, ang:270, bkb:40, kbg:70 }] },
      },
      // 必殺技でつかんだ後の動き（held = つかんだ相手の位置 [コマ, 前, 上, 回転]）
      extraMoves: {
        sspecialHit: { name: 'ローリングプレス（命中）', dur: 62, release: 46, noLandCancel: true,
                poses: [[0,'leapGrab',{r:0}],[6,'tuck',{r:0}],[18,'tuck',{r:360}],[30,'tuck',{r:720}],[38,'bodyPress',{r:790,pa:1}],[48,'bodyPress',{r:790,pa:1}],[62,'idle',{r:720}]],
                events: [{ f:[2,34], vx:5 }],
                held: [[0,40,20,0],[6,12,25,0],[18,12,25,-360],[30,12,25,-720],[38,30,0,-810],[46,30,0,-810]],
                hit: { dmg:9.4, ang:80, fkb:35, react:'down' } },
        dspecialHit: { name: 'スリーパーホールド（命中）', dur: 72, release: 58, noLandCancel: true, faceAway: true,
                poses: [[0,'grab'],[6,'sleeperHold',{tw:0}],[20,'sleeperHold',{tw:0.4}],[28,'sleeperHold',{tw:-0.4}],[36,'sleeperHold',{tw:0.4}],[44,'sleeperHold',{tw:-0.4}],[56,'sleeperHold',{t:24}],[72,'idle']],
                held: [[0,26,0,0],[8,16,0,0],[56,18,0,-20]],
                hit: { dmg:8.6, ang:85, fkb:20, react:'down' } },
      },
      throws: {
        fthrow: { name: '前投げ：ボディスラム', dur: 34, release: 16, poses: [[0,'hold'],[8,'throwUp'],[16,'throwDown'],[34,'idle']],
                  held: [[0,36,0,0],[8,10,110,-90],[15,40,0,-180]], hit: { dmg:7.9, ang:45, bkb:60, kbg:99 } },
        bthrow: { name: '後ろ投げ：ジャーマンスープレックス', dur: 44, release: 22,
                  poses: [[0,'hold'],[8,'germanWind'],[18,'germanBridge'],[30,'germanBridge'],[44,'idle']],
                  held: [[0,30,0,0],[8,20,40,0],[18,-10,100,180],[22,-45,10,180]], hit: { dmg:9.4, ang:140, bkb:65, kbg:98 } },
        uthrow: { name: '上投げ：リフトアップ', dur: 36, release: 16, poses: [[0,'hold'],[10,'throwUp'],[16,'throwUp'],[36,'idle']],
                  held: [[0,36,0,0],[10,0,120,90],[16,0,130,90]], hit: { dmg:6.5, ang:90, bkb:70, kbg:111 } },
        dthrow: { name: '下投げ：パワーボム（ダウン）', dur: 40, release: 20, poses: [[0,'hold'],[10,'throwUp'],[20,'throwDown'],[40,'idle']],
                  held: [[0,36,0,0],[10,5,120,180],[19,36,0,180]], hit: { dmg:7.9, ang:80, fkb:35, react:'down' } },
      },
      projectiles: {
        shock: { type:'shock', speed:7, life:32, r:16, dmg:5.8, ang:70, bkb:40, kbg:60 },
      },
      overrides: {},
    },

    /* ===== 7：狐の剣士（近距離・スピード・刀）小さくて速い ===== */
    {
      id: 'fox', no: 7, name: '狐の剣士', range: '近距離', type: 'スピード', weapon: 'katana',
      portrait: 'face_fox.jpg', // キャラ選択の絵
      model: 'fox.glb', // 3Dモデル（Higgsfieldで作成・Blenderでしっぽとマフラーの骨を追加）
      stats: { weight: 76, walk: 3.8, run: 8.4, air: 4.5, airAccel: 0.52, jump: 15.8, djump: 15,
               gravity: 0.62, fall: 10.8, airJumps: 1, dmgMul: 0.85, kbMul: 1.0, speed: 1.1 },
      look: { thick: 5.5, head: 9, scale: 0.8, gaze: { pitch: -9 } }, // scale：体の大きさ（0.8 = 2割小さい。くらう範囲も小さくなる）
      cpu: { style: 'mid', range: 70, counter: true },
      specials: {
        /* --- 地上 --- */
        n:    { name: 'NB：飛燕（ひえん）斬撃波', dur: 34,
                poses: [[0,'kSlashWind'],[8,'kSlash',{tw:0.8}],[16,'kSlash'],[34,'kReady']],
                events: [{ f:9, proj:'wave', ang:0, x:40, y:55 }] },
        // 瞬歩：消えて（無敵）、目の前の相手の背中側に現れて斬る。相手がいなければ前へ移動
        side: { name: '横B：瞬歩（しゅんぽ）', dur: 46,
                poses: [[0,'iaiWind'],[6,'iaiWind'],[14,'iaiWind'],[17,'iaiSlash'],[26,'iaiSlash'],[46,'kReady']],
                events: [{ f:5, vanish:true }, { f:13, warp:{ dist:150, behind:46, range:230 } }, { f:14, vanish:false }],
                hits: [{ f:[16,18], x:52, y:48, r:24, dmg:7.9, ang:38, bkb:48, kbg:150 }] },
        up:   { name: '上B：昇竜斬り', dur: 44, helpless: true, landLag: 18, aim: { f:[0,12], max:60 },
                poses: [[0,'kUpWind',{yw:0}],[4,'kUpArc',{yw:0}],[18,'kUpArc',{yw:720}],[28,'kUpArc',{yw:720}],[44,'helpless',{yw:720}]],
                events: [{ f:[4,19], vy:16, vx:1.5 }, { f:20, vy:3 }],
                gravityFrames: [0,20],
                hits: [{ f:[4,15], x:10, y:90, r:20, dmg:1.4, ang:88, bkb:20, kbg:8, rehit:4, react:'light' },
                       { f:[16,18], x:10, y:100, r:24, dmg:3.6, ang:80, bkb:55, kbg:75, rehit:2 }] },
        down: { name: '下B：見切り（カウンター）', dur: 46,
                counter: { f:[4,24], mul:1.3, min:5.8, ang:40, bkb:45, kbg:85 },
                poses: [[0,'kCounter'],[24,'kCounter'],[46,'idle']] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中飛燕', dur: 34, landLag: 10, gravityMul: 0.5,
                poses: [[0,'kSlashWind'],[8,'kSlash',{tw:0.8}],[16,'kSlash'],[34,'fall']],
                events: [{ f:9, proj:'wave', ang:0, x:40, y:55 }] },
        airF: { name: '空中前B：空中瞬歩', dur: 44, landLag: 12, oncePerAir: true, gravityMul: 0.15,
                poses: [[0,'iaiWind'],[12,'iaiWind'],[15,'iaiSlash'],[24,'iaiSlash'],[44,'fall']],
                events: [{ f:0, vy:1.5 }, { f:4, vanish:true }, { f:11, warp:{ dist:140, behind:46, range:220 } }, { f:12, vanish:false }],
                hits: [{ f:[14,16], x:52, y:48, r:24, dmg:8.6, ang:40, bkb:46, kbg:162 }] },
        airB: { name: '空中後B：振り向き居合', dur: 38, landLag: 12,
                poses: [[0,'iaiWind'],[10,'iaiSlash'],[20,'iaiSlash'],[38,'fall']],
                events: [{ f:2, turn:true }],
                hits: [{ f:[10,12], x:66, y:50, r:20, dmg:10.1, ang:40, bkb:38, kbg:144 }] },
        airU: { name: '空中上B：昇竜斬り', dur: 44, helpless: true, landLag: 18, aim: { f:[0,12], max:60 },
                poses: [[0,'kUpWind',{yw:0}],[4,'kUpArc',{yw:0}],[18,'kUpArc',{yw:720}],[28,'kUpArc',{yw:720}],[44,'helpless',{yw:720}]],
                events: [{ f:[4,19], vy:17, vx:2 }, { f:20, vy:3 }],
                gravityFrames: [0,20],
                hits: [{ f:[4,15], x:10, y:90, r:20, dmg:1.4, ang:88, bkb:20, kbg:8, rehit:4, react:'light' },
                       { f:[16,18], x:10, y:100, r:24, dmg:3.6, ang:80, bkb:55, kbg:93, rehit:2 }] },
        airD: { name: '空中下B：落鷹（らくよう）急降下斬り（メテオ）', dur: 48, landLag: 22,
                poses: [[0,'tuck'],[8,'kDive'],[48,'kDive']],
                events: [{ f:0, vy:4 }, { f:[8,40], vy:-13, vx:6 }],
                gravityFrames: [0,40],
                hits: [{ f:[8,40], x:40, y:30, r:22, dmg:7.9, ang:280, bkb:35, kbg:70 }] },
      },
      throws: {
        fthrow: { name: '前投げ：斬り払い', dur: 28, release: 11, poses: [[0,'hold'],[6,'kSlashWind'],[11,'kSlash'],[28,'idle']],
                  held: [[0,30,0,0],[11,40,8,0]], hit: { dmg:5.8, ang:40, bkb:55, kbg:125 } },
        bthrow: { name: '後ろ投げ：背負い投げ', dur: 32, release: 13, poses: [[0,'hold'],[7,'throwUp'],[13,'throwDown'],[32,'idle']],
                  events: [{ f:0, turn:true }],
                  held: [[0,-30,0,0],[7,-5,60,-90],[13,36,8,-180]], hit: { dmg:7.2, ang:42, bkb:60, kbg:125 } },
        uthrow: { name: '上投げ：斬り上げ', dur: 32, release: 12, poses: [[0,'hold'],[6,'kUpWind'],[12,'kUpArc'],[32,'idle']],
                  held: [[0,30,0,0],[12,6,80,0]], hit: { dmg:5, ang:90, bkb:65, kbg:89 } },
        dthrow: { name: '下投げ：たたきつけ突き', dur: 34, release: 14, poses: [[0,'hold'],[8,'kSlashWind'],[14,'kDownThrust'],[34,'idle']],
                  held: [[0,30,0,0],[14,28,-2,0]], hit: { dmg:4.3, ang:80, bkb:55, kbg:35 } },
      },
      projectiles: {
        wave: { type:'wave', speed:11, life:24, r:20, dmg:5, ang:40, bkb:30, kbg:55, max:1 },
      },
      overrides: {},
    },

    /* ===== 14：弓使い（遠距離・バランス・弓） ===== */
    {
      id: 'bow', no: 14, name: '弓使い', range: '遠距離', type: 'バランス', weapon: 'bow',
      portrait: 'face_bow.jpg', // キャラ選択の絵
      model: 'archer.glb', // 3Dモデル（Higgsfieldで作成・Blenderで髪と布の骨を追加）
      stats: { weight: 96, walk: 3.4, run: 6.2, air: 3.9, airAccel: 0.42, jump: 15.2, djump: 14.2,
               gravity: 0.6, fall: 10.2, airJumps: 1, dmgMul: 1.12, kbMul: 1.0, speed: 1.0 },
      look: { thick: 6, head: 10, gaze: { pitch: 3, tilt: 0.08 } },
      cpu: { style: 'zone', range: 330, reflect: true },
      specials: {
        /* --- 地上 --- */
        // holdShot = Bを押している間ためて、離すと発射（min = ためなし、max = 最大ため）
        n:    { name: 'NB：穿楊（せんよう）ため撃ち', dur: 34,
                holdShot: { f:6, max:90, over:30, min:{ dmg:3.6, speed:13, bkb:25, kbg:37 }, max2:{ dmg:15.8, speed:26, bkb:45, kbg:73 } },
                poses: [[0,'aim'],[6,'aimDraw'],[9,'release'],[34,'idle']],
                events: [{ f:9, proj:'arrow', shot:true, ang:0, x:30, y:68 }] },
        // 旋矢（せんし）：矢をバトンのように手元で回しながら踏み込み、連続で斬りつけて最後に突き飛ばす
        side: { name: '横B：旋矢（矢を回して連続斬り→突き）', dur: 54, twirl: [0, 44],
                poses: [[0,'twirlWind'],[6,'twirlA'],[12,'twirlB'],[18,'twirlA'],[24,'twirlB'],[29,'twirlWind2'],[34,'twirlFinish'],[44,'twirlFinish'],[54,'idle']],
                events: [{ f:[4,28], vx:3.2 }, { f:[31,34], vx:3.5 }],
                hits: [{ f:[6,28], x:48, y:66, r:28, dmg:1.1, ang:0, fkb:0, drag:[46, 0], rehit:5, react:'light' }, // 回る矢：相手を巻き込む
                       { f:[33,36], x:50, y:64, r:34, dmg:5.8, ang:40, bkb:45, kbg:166 }] },
        up:   { name: '上B：天翔（てんしょう）攻撃なし', dur: 42, helpless: true, landLag: 16, aim: { f:[0,14], max:60 },
                poses: [[0,'aimDown'],[6,'releaseDown'],[10,'takeoff'],[26,'jump'],[42,'helpless']],
                events: [{ f:6, proj:'arrow', noHit:true, ang:-90, x:0, y:20, speed:24 }, { f:[6,22], vy:16 }, { f:23, vy:8 }],
                gravityFrames: [0,23] },
        down: { name: '下B：反射の構え（1.5倍）', dur: 34, reflect: { f:[4,24], x:15, y:55, r:62, mul:1.5 },
                poses: [[0,'guard',{wr:0}],[4,'guard',{wr:180}],[24,'guard',{wr:1440}],[34,'idle',{wr:1440}]] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中穿楊', dur: 32, landLag: 10, gravityMul: 0.25,
                holdShot: { f:6, max:60, over:20, min:{ dmg:3.6, speed:13, bkb:25, kbg:45 }, max2:{ dmg:13, speed:24, bkb:40, kbg:85 } },
                poses: [[0,'aim'],[6,'aimDraw'],[9,'release'],[32,'fall']],
                events: [{ f:9, proj:'arrow', shot:true, ang:0, x:30, y:68 }] },
        // 螺旋矢：ドリルのように回る矢。当たると相手を巻き込んで連続ヒット → 最後にドン
        airF: { name: '空中前B：螺旋矢（ドリルアロー）', dur: 42, landLag: 14, gravityMul: 0.3,
                poses: [[0,'aim'],[6,'aimDraw'],[13,'aimDraw'],[15,'release'],[30,'release'],[42,'fall']],
                events: [{ f:0, vy:1.5 }, { f:15, proj:'drill', ang:0, x:34, y:68 }, { f:15, vx:-2.5 }] },
        // 振り向き剛射：振り向きざま、ゼロ距離で強い一矢を撃ちこむ
        airB: { name: '空中後B：振り向き剛射', dur: 40, landLag: 12,
                poses: [[0,'fall'],[3,'aim'],[8,'aimDraw'],[11,'release'],[24,'release'],[40,'fall']],
                events: [{ f:2, turn:true }, { f:11, proj:'arrow', big:true, noDouble:true, ang:0, x:30, y:68, speed:30, dmg:4.3, kang:40, bkb:30, kbg:99 }, { f:11, vx:-4 }, { f:11, blast:{ x:44, y:68, col:'#ffe9a8' } }],
                hits: [{ f:[11,12], x:46, y:66, r:28, dmg:9.4, ang:40, bkb:40, kbg:159 }] },
        airU: { name: '空中上B：天翔', dur: 44, helpless: true, landLag: 16, aim: { f:[0,14], max:60 },
                poses: [[0,'aimDown'],[6,'releaseDown'],[10,'takeoff'],[26,'jump'],[44,'helpless']],
                events: [{ f:6, proj:'arrow', noHit:true, ang:-90, x:0, y:20, speed:24 }, { f:[6,24], vy:16.5 }, { f:25, vy:8 }],
                gravityFrames: [0,25] },
        airD: { name: '空中下B：空中反射', dur: 36, landLag: 10, gravityMul: 0.25, reflect: { f:[4,24], x:15, y:55, r:62, mul:1.5 },
                poses: [[0,'guard',{wr:0}],[4,'guard',{wr:180}],[24,'guard',{wr:1440}],[36,'fall',{wr:1440}]],
                events: [{ f:0, vy:2 }] },
      },
      throws: {
        fthrow: { name: '前投げ：弓押し出し', dur: 26, release: 10, poses: [[0,'hold'],[9,'bowSweep'],[26,'idle']],
                  held: [[0,36,0,0],[9,50,8,0]], hit: { dmg:5.8, ang:40, bkb:55, kbg:122 } },
        bthrow: { name: '後ろ投げ：背負い投げ', dur: 34, release: 14, poses: [[0,'hold'],[7,'throwUp'],[13,'throwDown'],[34,'idle']],
                  events: [{ f:0, turn:true }],
                  held: [[0,-36,0,0],[7,-5,70,-90],[13,40,10,-180]], hit: { dmg:7.2, ang:40, bkb:60, kbg:120 } },
        uthrow: { name: '上投げ：打ち上げ射ち', dur: 40, release: 10, poses: [[0,'hold'],[10,'throwUp'],[15,'aimUp'],[19,'releaseUp'],[40,'idle']],
                  held: [[0,36,0,0],[10,10,90,0]], hit: { dmg:2.9, ang:90, bkb:75, kbg:45 },
                  events: [{ f:19, proj:'arrow', ang:90, x:0, y:90, speed:20, dmg:3.6, kang:88, bkb:40, kbg:60 }] },
        dthrow: { name: '下投げ：地面たたきつけ', dur: 34, release: 13, poses: [[0,'hold'],[6,'overheadWind'],[12,'throwDown'],[34,'idle']],
                  held: [[0,36,0,0],[6,30,50,0],[12,32,-2,0]], hit: { dmg:5, ang:82, bkb:60, kbg:40 } },
      },
      projectiles: {
        arrow: { type:'arrow', speed:16, grav:0.08, life:75, r:9, dmg:3.6, ang:40, bkb:22, kbg:50 },
        // 螺旋矢：links 回巻き込んでから、最後の一撃（dmg / bkb / kbg）で吹っ飛ばす
        drill: { type:'drill', speed:13, life:46, r:18, linkDmg:1.1, links:4, rehit:4, dmg:5, ang:40, bkb:45, kbg:193 },
      },
      overrides: {},
    },

    /* ===== 16：エージェント（遠距離・トラップ・スパイ道具） ===== */
    {
      id: 'agent', no: 16, name: 'エージェント', range: '遠距離', type: 'トラップ', weapon: 'gadget',
      portrait: 'face_agent.jpg', // キャラ選択の絵
      model: 'agentA.glb',  // 3Dモデル（スーツ・サングラス）
      model2: 'agentB.glb', // ％が swapPct を超えると、この姿（ジャケットとサングラスなし）に変わる
      swapPct: 100,
      stats: { weight: 92, walk: 3.5, run: 6.6, air: 4.0, airAccel: 0.44, jump: 15, djump: 14,
               gravity: 0.56, fall: 9.8, airJumps: 1, dmgMul: 1.06, kbMul: 1.0, speed: 1.04 },
      look: { thick: 5.5, head: 10, gaze: { pitch: 5, tilt: 0.16 } },
      cpu: { style: 'zone', range: 300, mine: true },
      specials: {
        /* --- 地上 --- */
        // holdShot = Bを押している間ためて、離すと発射（min = ためなし、max2 = 最大ため）
        n:    { name: 'NB：サイレンサー・ため撃ち', dur: 32,
                holdShot: { f:6, max:80, over:30, min:{ dmg:2.2, speed:22, bkb:20, kbg:37 }, max2:{ dmg:10.8, speed:32, bkb:40, kbg:92 } },
                poses: [[0,'gunAim'],[6,'gunAim'],[9,'gunFire'],[32,'idle']],
                events: [{ f:9, proj:'bullet', shot:true, ang:0, x:42, y:74 }] },
        side: { name: '横B：ワイヤーフック（引き寄せ）', dur: 46, wire: [4, 30],
                poses: [[0,'wireThrow'],[10,'wireThrow'],[20,'pull'],[46,'idle']],
                hits: [{ f:[10,14], x:150, y:72, r:18, dmg:2.9, pull:true }] },
        up:   { name: '上B：ワイヤー上昇', dur: 44, helpless: true, landLag: 18, wire: [3, 24], wireTip: [70, 210], aim: { f:[0,10], max:60 },
                poses: [[0,'wireUp'],[24,'wireUp'],[30,'jump'],[44,'helpless']],
                events: [{ f:[6,24], vy:14, vx:2 }, { f:25, vy:4 }],
                gravityFrames: [0,25],
                hits: [{ f:[5,9], x:66, y:190, r:24, dmg:4.3, ang:80, bkb:50, kbg:60 }] },
        down: { name: '下B：地雷セット（1個まで）', dur: 34,
                poses: [[0,'crouch'],[8,'placeMine'],[18,'placeMine'],[34,'idle']],
                events: [{ f:12, proj:'mine', x:40, y:0 }] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中ため撃ち', dur: 32, landLag: 10, gravityMul: 0.25,
                holdShot: { f:6, max:60, over:20, min:{ dmg:2.2, speed:22, bkb:20, kbg:42 }, max2:{ dmg:9.4, speed:30, bkb:38, kbg:98 } },
                poses: [[0,'gunAim'],[6,'gunAim'],[9,'gunFire'],[32,'fall']],
                events: [{ f:9, proj:'bullet', shot:true, ang:0, x:42, y:74 }] },
        airF: { name: '空中前B：ワイヤーで引き寄せてスタンガン', dur: 48, landLag: 12, gravityMul: 0.3, wire: [4, 30],
                poses: [[0,'wireThrow'],[10,'wireThrow'],[20,'pull'],[22,'jabReady'],[25,'punch'],[34,'punch'],[48,'fall']],
                hits: [{ f:[10,14], x:150, y:72, r:18, dmg:2.9, pull:true },
                       { f:[25,28], x:44, y:62, r:28, dmg:7.2, ang:42, bkb:45, kbg:172, rehit:10, elec:true }] },
        // 振り向き散弾銃：振り向きざまに撃つ。近いほど強い（反動で少し後ろに下がる）
        airB: { name: '空中後B：振り向き散弾銃', dur: 40, landLag: 12,
                poses: [[0,'fall'],[3,'gunAim'],[10,'gunAim'],[12,'gunFire'],[24,'gunFire'],[40,'fall']],
                events: [{ f:2, turn:true }, { f:12, vx:-5 }, { f:12, blast:{ x:58, y:74, col:'#ffd060' } },
                         { f:12, proj:'pellet', ang:9, x:46, y:74 }, { f:12, proj:'pellet', ang:0, x:46, y:74 }, { f:12, proj:'pellet', ang:-9, x:46, y:74 }],
                hits: [{ f:[12,13], x:52, y:72, r:30, dmg:9.4, ang:40, bkb:40, kbg:157 },
                       { f:[12,13], x:108, y:74, r:26, dmg:4.3, ang:38, bkb:30, kbg:94 }] },
        airU: { name: '空中上B：ワイヤー上昇', dur: 44, helpless: true, landLag: 18, wire: [3, 24], wireTip: [70, 210], aim: { f:[0,10], max:60 },
                poses: [[0,'wireUp'],[24,'wireUp'],[30,'jump'],[44,'helpless']],
                events: [{ f:[6,24], vy:15.5, vx:2 }, { f:25, vy:4 }],
                gravityFrames: [0,25],
                hits: [{ f:[5,9], x:66, y:190, r:24, dmg:4.3, ang:80, bkb:50, kbg:60 }] },
        airD: { name: '空中下B：反射ガジェット（1.4倍）', dur: 36, landLag: 10, gravityMul: 0.25,
                reflect: { f:[4,24], x:24, y:55, r:58, mul:1.4 },
                poses: [[0,'gunAim'],[4,'guard'],[24,'guard'],[36,'fall']],
                events: [{ f:0, vy:2 }] },
      },
      throws: {
        fthrow: { name: '前投げ：前蹴り', dur: 28, release: 11, poses: [[0,'hold'],[6,'kickWind'],[11,'kick'],[28,'idle']],
                  held: [[0,36,0,0],[11,48,10,0]], hit: { dmg:5.8, ang:40, bkb:55, kbg:122 } },
        bthrow: { name: '後ろ投げ：巴投げ', dur: 34, release: 14, poses: [[0,'hold'],[7,'throwUp'],[14,'throwDown'],[34,'idle']],
                  events: [{ f:0, turn:true }],
                  held: [[0,-36,0,0],[7,-5,70,-90],[14,40,10,-180]], hit: { dmg:7.2, ang:40, bkb:60, kbg:120 } },
        uthrow: { name: '上投げ：打ち上げて撃つ', dur: 40, release: 10, poses: [[0,'hold'],[10,'throwUp'],[15,'gunAim',{fa1:150,ba1:140}],[19,'gunFire',{fa1:160,ba1:150}],[40,'idle']],
                  held: [[0,36,0,0],[10,10,90,0]], hit: { dmg:2.9, ang:90, bkb:75, kbg:45 },
                  events: [{ f:19, proj:'bullet', ang:88, x:0, y:110, speed:24, dmg:3.6, kang:88, bkb:40, kbg:60 }] },
        dthrow: { name: '下投げ：踏みつけ', dur: 34, release: 14, poses: [[0,'hold'],[6,'stompWind'],[14,'stompDown'],[34,'idle']],
                  held: [[0,36,0,0],[14,34,-2,0]], hit: { dmg:5, ang:82, bkb:58, kbg:40, react:'down' } },
      },
      /* ===== 覚醒（％が swapPct を超えたとき）=====
         ジャケットとサングラスを外した姿になり、全部の技が強化版に変わる。撃墜されると元に戻る
         dmgMul：全部の技の攻撃力の倍率（1.5 = 1.5倍） / speedMul：技の速さの倍率 */
      awaken: {
        dmgMul: 1.5, speedMul: 1.12,
        // 強化版の必殺技（ここに書いた技だけ入れかわる）
        specials: {
          n:    { name: 'NB【覚醒】ダブルタップ（2連射・最大ためは貫通）', dur: 38,
                  holdShot: { f:6, max:50, over:30, min:{ dmg:2.2, speed:24, bkb:20, kbg:35 }, max2:{ dmg:10.1, speed:34, bkb:40, kbg:86 } },
                  poses: [[0,'gunAim'],[6,'gunAim'],[9,'gunFire'],[13,'gunAim'],[16,'gunFire'],[38,'idle']],
                  events: [{ f:9, proj:'bullet', shot:true, ang:0, x:42, y:74 }, { f:16, proj:'bullet', shot:true, ang:0, x:42, y:74 }] },
          side: { name: '横B【覚醒】ショックワイヤー（引き寄せて電撃）', dur: 50, wire: [4, 30],
                  poses: [[0,'wireThrow'],[10,'wireThrow'],[20,'pull'],[24,'punch'],[30,'punch'],[50,'idle']],
                  hits: [{ f:[10,14], x:150, y:72, r:18, dmg:2.9, pull:true },
                         { f:[23,27], x:44, y:62, r:28, dmg:4.3, ang:45, bkb:55, kbg:62, rehit:10, elec:true }] },
          up:   { name: '上B【覚醒】ワイヤー急上昇', dur: 44, helpless: true, landLag: 16, wire: [3, 24], wireTip: [70, 230], aim: { f:[0,10], max:60 },
                  poses: [[0,'wireUp'],[24,'wireUp'],[30,'jump'],[44,'helpless']],
                  events: [{ f:[6,24], vy:15.5, vx:2.5 }, { f:25, vy:4 }],
                  gravityFrames: [0,25],
                  hits: [{ f:[5,10], x:66, y:205, r:28, dmg:6.5, ang:80, bkb:55, kbg:66, elec:true }] },
          down: { name: '下B【覚醒】地雷セット（2個まで・大爆発）', dur: 32,
                  poses: [[0,'crouch'],[8,'placeMine'],[18,'placeMine'],[32,'idle']],
                  events: [{ f:12, proj:'mine', x:40, y:0 }] },
          airN: { name: '空中NB【覚醒】空中ダブルタップ', dur: 38, landLag: 10, gravityMul: 0.25,
                  holdShot: { f:6, max:44, over:20, min:{ dmg:2.2, speed:24, bkb:20, kbg:35 }, max2:{ dmg:8.6, speed:32, bkb:38, kbg:80 } },
                  poses: [[0,'gunAim'],[6,'gunAim'],[9,'gunFire'],[13,'gunAim'],[16,'gunFire'],[38,'fall']],
                  events: [{ f:9, proj:'bullet', shot:true, ang:0, x:42, y:74 }, { f:16, proj:'bullet', shot:true, ang:0, x:42, y:74 }] },
          airF: { name: '空中前B【覚醒】ワイヤー＋高圧スタンガン', dur: 48, landLag: 12, gravityMul: 0.3, wire: [4, 30],
                  poses: [[0,'wireThrow'],[10,'wireThrow'],[20,'pull'],[22,'jabReady'],[25,'punch'],[34,'punch'],[48,'fall']],
                  hits: [{ f:[10,14], x:150, y:72, r:18, dmg:2.9, pull:true },
                         { f:[25,28], x:44, y:62, r:30, dmg:7.2, ang:42, bkb:45, kbg:134, rehit:10, elec:true }] },
          airU: { name: '空中上B【覚醒】ワイヤー急上昇', dur: 44, helpless: true, landLag: 16, wire: [3, 24], wireTip: [70, 230], aim: { f:[0,10], max:60 },
                  poses: [[0,'wireUp'],[24,'wireUp'],[30,'jump'],[44,'helpless']],
                  events: [{ f:[6,24], vy:17, vx:2.5 }, { f:25, vy:4 }],
                  gravityFrames: [0,25],
                  hits: [{ f:[5,10], x:66, y:205, r:28, dmg:6.5, ang:80, bkb:55, kbg:66, elec:true }] },
          airD: { name: '空中下B【覚醒】反射ガジェット（2倍）', dur: 36, landLag: 10, gravityMul: 0.25,
                  reflect: { f:[4,26], x:24, y:55, r:66, mul:2.0 },
                  poses: [[0,'gunAim'],[4,'guard'],[26,'guard'],[36,'fall']],
                  events: [{ f:0, vy:2 }] },
        },
        // 強化版の通常技（ここに書いた技は丸ごと入れかわる）
        moves: {
          jab3: { name: '弱3【覚醒】3連キック', dur: 40, iasa: 36,
                  poses: [[0,'kickWind'],[4,'kick'],[8,'kickWind'],[12,'roundKick'],[17,'kickWind',{yw:0}],[20,'roundKick',{yw:360}],[28,'roundKick',{yw:360}],[40,'idle',{yw:360}]],
                  hits: [{ f:[4,5], x:46, y:50, r:18, dmg:1.5, ang:30, fkb:32, react:'light' },
                         { f:[12,13], x:46, y:58, r:18, dmg:1.5, ang:30, fkb:32, react:'light', rehit:6 },
                         { f:[20,22], x:50, y:60, r:22, dmg:2.4, ang:70, bkb:55, kbg:32, rehit:6 }] },
        },
        projectiles: {
          bullet: { type:'bullet', speed:24, life:40, r:8, dmg:2.2, ang:30, bkb:20, kbg:40, pierce:true }, // 最大ためは相手をつらぬく
          mine:   { type:'mine', life:720, arm:30, r:30, dmg:10.8, ang:80, bkb:66, kbg:76, max:2, replace:true, boom:140 },
          smoke:  { type:'smoke', speed:6, grav:0.35, life:240, r:12, cloudR:85, cloudLife:200, dmg:1.1, rehit:12, ang:85, fkb:22, react:'light' },
          pellet: { type:'bullet', speed:30, life:6, r:4, dmg:0, ang:0, bkb:0, kbg:0, noHit:true },
        },
      },
      projectiles: {
        bullet: { type:'bullet', speed:22, life:40, r:7, dmg:2.2, ang:30, bkb:20, kbg:40 },
        // 地雷：置いてから arm コマで準備完了。相手がふれると爆発（1個まで。新しく置くと古いのは消える）
        mine:   { type:'mine', life:720, arm:36, r:22, dmg:9.4, ang:80, bkb:62, kbg:72, max:1, replace:true },
        // 煙幕弾：投げて地面か一定時間で煙になり、中にいる相手に小さなダメージが続く
        smoke:  { type:'smoke', speed:6, grav:0.35, life:150, r:12, cloudR:58, dmg:1.1, rehit:14, ang:85, fkb:22, react:'light' },
        // 散弾銃の見た目の弾（当たり判定は技のほうにある）
        pellet: { type:'bullet', speed:30, life:6, r:4, dmg:0, ang:0, bkb:0, kbg:0, noHit:true },
      },
      overrides: {},
    },

    /* ===== 31：ロボ（近〜遠距離・パワー・特殊）大きくて重い。ためビームとジェット飛行 =====
       弱点：体が大きく当たりやすい。重くて落ちるのが速く、のけぞりも長いので連続技を入れられやすい */
    {
      id: 'robot', no: 31, name: 'ロボ', range: '万能', type: 'パワー', weapon: 'mech',
      portrait: 'face_robot.jpg',
      model: 'robot.glb', // 3Dモデル（Higgsfieldで作成）
      // hitstunMul：のけぞる時間の倍率（1.18 = 18%長い → 連続技を入れられやすい）
      stats: { weight: 124, walk: 2.6, run: 5.6, air: 3.1, airAccel: 0.28, jump: 13.2, djump: 12.2,
               gravity: 0.86, fall: 13.5, airJumps: 1, dmgMul: 0.92, kbMul: 1.0, speed: 0.92, hitstunMul: 1.3, projTakenMul: 1.25 },
      look: { thick: 10.5, head: 12, scale: 1.24, gaze: { pitch: 2 } }, // scale：体の大きさ（1.18 = 18%大きい。くらう範囲も大きい）
      jetFuel: 85, jetRegen: 1.2, // ジェットの燃料（飛べるコマ数）と、地面にいるときの回復の速さ
      cpu: { style: 'mid', range: 80 },
      specials: {
        /* --- 地上 --- */
        n:    { name: 'NB：チャージビーム（ためるほど太く強い）', dur: 40,
                holdShot: { f:8, max:90, over:40, min:{ dmg:4.3, speed:0, bkb:30, kbg:34 }, max2:{ dmg:17.3, speed:0, bkb:45, kbg:68 } },
                poses: [[0,'beamCharge'],[8,'beamCharge'],[11,'beamFire'],[26,'beamFire'],[40,'idle']],
                events: [{ f:11, proj:'beam', shot:true, ang:0, x:62, y:84 }] },
        side: { name: '横B：ブーストタックル（出だしだけアーマー）', dur: 58, armor: [6, 10],
                poses: [[0,'dashStart'],[6,'tackle'],[20,'tackle'],[30,'crouch'],[58,'idle']],
                events: [{ f:[7,19], vx:9.5 }, { f:7, blast:{ x:-30, y:80, col:'#8fe6ff' } }],
                hits: [{ f:[8,19], x:36, y:70, r:30, dmg:6.5, ang:42, bkb:50, kbg:100 }] }, // 外すと大きなスキ
        up:   { name: '上B：ジェット飛行（Bを押している間、スティックの方へ飛ぶ）', dur: 20, jet: { f:6, speed:6.2, accel:0.8 }, landLag: 10,
                poses: [[0,'crouch'],[6,'jetFly'],[20,'fall']],
                gravityFrames: [0,6] },
        down: { name: '下B：グラウンドスラム', dur: 58,
                poses: [[0,'poundWind'],[14,'poundWind'],[20,'pound'],[34,'pound'],[58,'idle']],
                events: [{ f:20, quake:true }, { f:20, proj:'shock', dir:1 }, { f:20, proj:'shock', dir:-1 }],
                hits: [{ f:[20,22], x:40, y:12, r:30, dmg:8.6, ang:80, bkb:55, kbg:60 },
                       { f:[20,22], x:-40, y:12, r:30, dmg:8.6, ang:100, bkb:55, kbg:60 }] },
        /* --- 空中 --- */
        airN: { name: '空中NB：チャージビーム', dur: 40, landLag: 12, gravityMul: 0.2,
                holdShot: { f:8, max:70, over:30, min:{ dmg:4.3, speed:0, bkb:30, kbg:41 }, max2:{ dmg:14.4, speed:0, bkb:42, kbg:76 } },
                poses: [[0,'beamCharge'],[8,'beamCharge'],[11,'beamFire'],[26,'beamFire'],[40,'fall']],
                events: [{ f:11, proj:'beam', shot:true, ang:0, x:62, y:84 }] },
        airF: { name: '空中前B：ブーストナックル', dur: 44, landLag: 16, oncePerAir: true, gravityMul: 0.2,
                poses: [[0,'rocketWind'],[8,'rocketPunch'],[22,'rocketPunch'],[44,'fall']],
                events: [{ f:0, vy:1.5 }, { f:[7,16], vx:9, vy:-1 }, { f:7, blast:{ x:-30, y:80, col:'#8fe6ff' } }],
                hits: [{ f:[9,14], x:56, y:78, r:28, dmg:10.1, ang:40, bkb:44, kbg:134 }] },
        airB: { name: '空中後B：リバースロケットパンチ', dur: 42, landLag: 14,
                poses: [[0,'fall'],[3,'rocketWind'],[12,'rocketPunch'],[24,'rocketPunch'],[42,'fall']],
                events: [{ f:2, turn:true }, { f:12, blast:{ x:72, y:80, col:'#8fe6ff' } }],
                hits: [{ f:[12,14], x:60, y:80, r:28, dmg:12.2, ang:40, bkb:40, kbg:128 }] },
        airU: { name: '空中上B：ジェット飛行', dur: 20, jet: { f:4, speed:6.2, accel:0.8 }, landLag: 10,
                poses: [[0,'fall'],[4,'jetFly'],[20,'fall']],
                gravityFrames: [0,4] },
        airD: { name: '空中下B：メテオダイブ', dur: 70, landLag: 26, helpless: true,
                poses: [[0,'tuck'],[8,'footStamp'],[70,'footStamp']],
                events: [{ f:0, vy:4 }, { f:[9,69], vy:-18, vx:0 }],
                gravityFrames: [0,70],
                landSpawn: [{ proj:'shock', dir:1 }, { proj:'shock', dir:-1 }],
                hits: [{ f:[9,69], x:4, y:10, r:28, dmg:10.1, ang:270, bkb:40, kbg:70 }] },
      },
      projectiles: {
        // ビーム：minLen〜maxLen = ためなし〜最大ための長さ / r〜r2 = 太さ / life = 出ている時間
        beam:  { type:'beam', life:14, minLen:170, maxLen:560, r:7, r2:18, dmg:4.3, ang:35, bkb:30, kbg:40 },
        shock: { type:'shock', speed:7, life:30, r:18, dmg:6.5, ang:70, bkb:42, kbg:60 },
      },
      overrides: {},
    },

    /* ===== 21：ネコ（近距離・スピード⇔パワー・4本足）下Bで「氷」と「炎」が入れかわる =====
       小さくて攻撃が当たりにくいかわりに、軽くて飛ばされやすい。
       氷：スピード重視。下強 → 横強／NB／横B につながりやすい
       炎：パワー重視。スマッシュが炎のパンチで、よく飛ばす */
    {
      id: 'cat', no: 21, name: 'ネコ（氷）', range: '近距離', type: '氷⇔炎', weapon: 'claw',
      portrait: 'face_cat_ice.jpg',
      model: 'cat_ice.glb', // 3Dモデル（Higgsfieldで作成・Blenderで4本足の骨を追加）
      stats: { weight: 91, walk: 3.6, run: 7.6, air: 4.2, airAccel: 0.5, jump: 15.2, djump: 14.4,
               gravity: 0.7, fall: 12, airJumps: 1, dmgMul: 1.1, kbMul: 1.0, speed: 1.12 },
      // quad：4本足 / hipH：腰の高さ / hurtR：くらう範囲の太さ
      look: { quad: true, hipH: 24, hurtR: 15, thick: 6, head: 9, tagH: 70, gaze: {} },
      cpu: { style: 'rush', range: 40 },
      specials: {
        /* --- 地上 --- */
        n:    { name: 'NB：氷のつぶて', dur: 26, elem: 'ice',
                poses: [[0,'q_castWind'],[6,'q_cast'],[14,'q_cast'],[26,'q_idle']],
                events: [{ f:7, proj:'shard', ang:4, x:26, y:24 }] },
        side: { name: '横B：アイススライド（すべって連続引っかき）', dur: 44, elem: 'ice',
                poses: [[0,'q_pounceW'],[4,'q_pounce'],[18,'q_pounce'],[22,'q_rearSlam'],[30,'q_rearSlam'],[44,'q_idle']],
                events: [{ f:[3,18], vx:8.5 }, { f:[19,22], vx:2 }],
                hits: [{ f:[4,18], x:18, y:18, r:18, dmg:1.1, ang:0, fkb:0, drag:[30, 0], rehit:5, react:'light' },
                       { f:[22,24], x:26, y:22, r:20, dmg:4.3, ang:42, bkb:45, kbg:191 }] },
        up:   { name: '上B：氷柱ジャンプ（向きを変えられる）', dur: 40, helpless: true, landLag: 14, elem: 'ice', aim: { f:[0,12], max:60 },
                poses: [[0,'q_crouch'],[5,'q_stretchUp'],[22,'q_stretchUp'],[30,'q_fall'],[40,'q_helpless']],
                events: [{ f:[5,20], vy:15 }, { f:21, vy:4 }],
                gravityFrames: [0,21],
                hits: [{ f:[5,8], x:0, y:20, r:22, dmg:3.6, ang:85, bkb:50, kbg:60 }] },
        down: { name: '下B：炎のネコに変わる', dur: 26,
                poses: [[0,'q_hiss'],[10,'q_sitProud'],[26,'q_idle']],
                events: [{ f:10, swapForm:true }] },
        /* --- 空中 --- */
        airN: { name: '空中NB：氷のつぶて', dur: 26, landLag: 8, gravityMul: 0.4, elem: 'ice',
                poses: [[0,'q_castWind'],[6,'q_cast'],[14,'q_cast'],[26,'q_fall']],
                events: [{ f:7, proj:'shard', ang:-12, x:26, y:24 }] },
        airF: { name: '空中前B：アイスダイブ', dur: 38, landLag: 12, oncePerAir: true, gravityMul: 0.3, elem: 'ice',
                poses: [[0,'q_pounceW'],[6,'q_pounce'],[18,'q_pounce'],[38,'q_fall']],
                events: [{ f:0, vy:2 }, { f:[5,14], vx:7 }],
                hits: [{ f:[7,11], x:24, y:20, r:20, dmg:7.2, ang:40, bkb:44, kbg:180 }] },
        airB: { name: '空中後B：振り向きフロストキック', dur: 36, landLag: 11, elem: 'ice',
                poses: [[0,'q_fall'],[3,'q_kickWind'],[9,'q_bunnyKick'],[18,'q_bunnyKick'],[36,'q_fall']],
                events: [{ f:2, turn:true }],
                hits: [{ f:[9,11], x:-26, y:20, r:20, dmg:8.6, ang:140, bkb:40, kbg:172 }] },
        airU: { name: '空中上B：氷柱ジャンプ', dur: 40, helpless: true, landLag: 14, elem: 'ice', aim: { f:[0,12], max:60 },
                poses: [[0,'q_ball'],[5,'q_stretchUp'],[22,'q_stretchUp'],[30,'q_fall'],[40,'q_helpless']],
                events: [{ f:[5,20], vy:15 }, { f:21, vy:4 }],
                gravityFrames: [0,21],
                hits: [{ f:[5,8], x:0, y:20, r:22, dmg:3.6, ang:85, bkb:50, kbg:60 }] },
        airD: { name: '空中下B：炎のネコに変わる', dur: 26, landLag: 8,
                poses: [[0,'q_ball'],[10,'q_fall'],[26,'q_fall']],
                events: [{ f:10, swapForm:true }] },
      },
      throws: {
        fthrow: { name: '前投げ：ねこパンチ連打', dur: 28, release: 12, poses: [[0,'q_hold'],[6,'q_swipe'],[9,'q_swipe2'],[12,'q_swipe'],[28,'q_idle']],
                  held: [[0,24,0,0],[12,30,6,0]], hit: { dmg:5, ang:40, bkb:55, kbg:144 } },
        bthrow: { name: '後ろ投げ：ねこキック', dur: 32, release: 14, poses: [[0,'q_hold'],[6,'q_kickWind'],[14,'q_bunnyKick'],[32,'q_idle']],
                  events: [{ f:0, turn:true }],
                  held: [[0,-24,0,0],[14,26,8,0]], hit: { dmg:6.5, ang:42, bkb:60, kbg:141 } },
        uthrow: { name: '上投げ：かち上げ', dur: 30, release: 12, poses: [[0,'q_hold'],[8,'q_upClawW'],[12,'q_stretchUp'],[30,'q_idle']],
                  held: [[0,24,0,0],[12,6,50,0]], hit: { dmg:4.3, ang:90, bkb:65, kbg:160 } },
        dthrow: { name: '下投げ：ふみつけ（つなぎ）', dur: 30, release: 12, poses: [[0,'q_hold'],[6,'q_rear'],[12,'q_rearSlam'],[30,'q_idle']],
                  held: [[0,24,0,0],[12,24,-2,0]], hit: { dmg:3.6, ang:80, bkb:50, kbg:25 } },
      },
      projectiles: {
        // 氷のつぶて：速くて小さい。少しのけぞらせて、次の技につなげる
        shard: { type:'shard', speed:15, life:30, r:9, dmg:2.9, ang:45, bkb:38, kbg:22, elem:'ice' },
      },
      /* ===== 炎の姿（下Bで入れかわる）：パワー重視。バンダナと目の傷 ===== */
      form2: {
        name: 'ネコ（炎）', portrait: 'face_cat_fire.jpg', model: 'cat_fire.glb',
        stats: { weight: 94, walk: 3.0, run: 6.2, air: 3.6, airAccel: 0.38, jump: 14.2, djump: 13.4,
                 gravity: 0.76, fall: 12.6, airJumps: 1, dmgMul: 1.32, kbMul: 1.0, speed: 0.96 },
        // 炎の姿で入れかわる通常技（強い技だけ）
        moves: {
          ftilt: { name: '横強【炎】燃えるツメ', dur: 28, iasa: 24, elem: 'fire',
                   poses: [[0,'q_swipeWind'],[7,'q_swipe',{fa1:95}],[12,'q_swipe'],[28,'q_idle']],
                   events: [{ f:[5,8], vx:3 }],
                   hits: [{ f:[7,9], x:30, y:24, r:18, dmg:7.2, ang:38, bkb:34, kbg:149 }] },
          dashAttack: { name: 'ダッシュA【炎】ファイアタックル', dur: 36, elem: 'fire',
                   poses: [[0,'q_pounceW'],[4,'q_pounce'],[16,'q_pounce'],[36,'q_idle']],
                   events: [{ f:[2,14], vx:6.5 }],
                   hits: [{ f:[4,12], x:22, y:20, r:20, dmg:7.2, ang:45, bkb:58, kbg:118 }] },
          fsmash:{ name: '横スマ【炎】炎のねこパンチ', dur: 58, charge: { f:12, max:60, mul:1.4 }, elem: 'fire',
                   poses: [[0,'q_punchWind'],[12,'q_punchWind'],[16,'q_punch'],[28,'q_punch'],[58,'q_idle']],
                   events: [{ f:15, vx:6 }],
                   hits: [{ f:[16,18], x:32, y:30, r:22, dmg:14.4, ang:38, bkb:42, kbg:122 }] },
          usmash:{ name: '上スマ【炎】火柱アッパー', dur: 54, charge: { f:10, max:60, mul:1.4 }, elem: 'fire',
                   poses: [[0,'q_upClawW'],[10,'q_upClawW'],[14,'q_upClaw'],[26,'q_upClaw'],[54,'q_idle']],
                   hits: [{ f:[14,18], x:10, y:56, r:24, dmg:12.2, ang:88, bkb:42, kbg:122 },
                          { f:[14,15], x:16, y:24, r:18, dmg:7.2, ang:92, bkb:50, kbg:92 }] },
          dsmash:{ name: '下スマ【炎】炎のしっぽ回し', dur: 56, charge: { f:10, max:60, mul:1.4 }, elem: 'fire',
                   poses: [[0,'q_crouch',{yw:0}],[10,'q_crouch',{yw:0}],[14,'q_tailSpin',{yw:200}],[20,'q_tailSpin',{yw:360}],[56,'q_idle',{yw:360}]],
                   hits: [{ f:[14,17], x:30, y:8, r:20, dmg:11.5, ang:30, bkb:42, kbg:101 },
                          { f:[14,17], x:-30, y:8, r:20, dmg:11.5, ang:150, bkb:42, kbg:101 }] },
          fair:  { name: '空前【炎】炎の引っかき', dur: 34, landLag: 10, elem: 'fire',
                   poses: [[0,'q_fall'],[4,'q_swipeWind'],[9,'q_swipe'],[18,'q_swipe'],[34,'q_fall']],
                   hits: [{ f:[9,11], x:26, y:20, r:20, dmg:8.6, ang:42, bkb:34, kbg:128 }] },
          bair:  { name: '空後【炎】ファイアキック', dur: 34, landLag: 11, elem: 'fire',
                   poses: [[0,'q_fall'],[4,'q_kickWind'],[9,'q_bunnyKick'],[18,'q_bunnyKick'],[34,'q_fall']],
                   hits: [{ f:[9,12], x:-26, y:20, r:20, dmg:10.1, ang:140, bkb:34, kbg:119 }] },
        },
        specials: {
          n:    { name: 'NB【炎】火の玉（ためられる）', dur: 30, elem: 'fire',
                  holdShot: { f:6, max:70, over:30, min:{ dmg:3.6, speed:9, bkb:30, kbg:45 }, max2:{ dmg:11.5, speed:12, bkb:45, kbg:88 } },
                  poses: [[0,'q_castWind'],[6,'q_castWind'],[9,'q_cast'],[30,'q_idle']],
                  events: [{ f:9, proj:'fireball', shot:true, ang:0, x:26, y:26 }] },
          side: { name: '横B【炎】フレイムクロー（とびかかり）', dur: 46, elem: 'fire',
                  poses: [[0,'q_pounceW'],[8,'q_pounceW'],[12,'q_pounce'],[20,'q_rearSlam'],[28,'q_rearSlam'],[46,'q_idle']],
                  events: [{ f:[10,18], vx:8 }],
                  hits: [{ f:[14,18], x:26, y:22, r:22, dmg:10.1, ang:40, bkb:42, kbg:83 }] },
          up:   { name: '上B【炎】ファイアジャンプ（真上だけ）', dur: 44, helpless: true, landLag: 20, elem: 'fire',
                  poses: [[0,'q_crouch'],[6,'q_stretchUp'],[22,'q_stretchUp'],[32,'q_fall'],[44,'q_helpless']],
                  events: [{ f:[6,18], vy:14 }, { f:19, vy:3 }],
                  gravityFrames: [0,19],
                  hits: [{ f:[6,14], x:0, y:24, r:26, dmg:1.4, ang:88, fkb:30, rehit:4, react:'light' },
                         { f:[16,18], x:0, y:40, r:28, dmg:4.3, ang:85, bkb:55, kbg:70 }] },
          down: { name: '下B：氷のネコに変わる', dur: 26,
                  poses: [[0,'q_hiss'],[10,'q_sitProud'],[26,'q_idle']],
                  events: [{ f:10, swapForm:true }] },
          airN: { name: '空中NB【炎】火の玉', dur: 30, landLag: 10, gravityMul: 0.3, elem: 'fire',
                  holdShot: { f:6, max:50, over:20, min:{ dmg:3.6, speed:9, bkb:30, kbg:54 }, max2:{ dmg:10.1, speed:12, bkb:42, kbg:101 } },
                  poses: [[0,'q_castWind'],[6,'q_castWind'],[9,'q_cast'],[30,'q_fall']],
                  events: [{ f:9, proj:'fireball', shot:true, ang:-15, x:26, y:26 }] },
          airF: { name: '空中前B【炎】フレイムダイブ', dur: 40, landLag: 14, oncePerAir: true, gravityMul: 0.3, elem: 'fire',
                  poses: [[0,'q_pounceW'],[7,'q_pounce'],[18,'q_pounce'],[40,'q_fall']],
                  events: [{ f:0, vy:2 }, { f:[6,14], vx:6.5, vy:-2.5 }],
                  hits: [{ f:[8,12], x:24, y:16, r:22, dmg:9.4, ang:40, bkb:44, kbg:139 }] },
          airB: { name: '空中後B【炎】振り向き炎のねこパンチ', dur: 40, landLag: 12, elem: 'fire',
                  poses: [[0,'q_fall'],[3,'q_punchWind'],[11,'q_punch'],[22,'q_punch'],[40,'q_fall']],
                  events: [{ f:2, turn:true }],
                  hits: [{ f:[11,13], x:30, y:28, r:22, dmg:11.5, ang:40, bkb:40, kbg:130 }] },
          airU: { name: '空中上B【炎】ファイアジャンプ', dur: 44, helpless: true, landLag: 20, elem: 'fire',
                  poses: [[0,'q_ball'],[6,'q_stretchUp'],[22,'q_stretchUp'],[32,'q_fall'],[44,'q_helpless']],
                  events: [{ f:[6,18], vy:14 }, { f:19, vy:3 }],
                  gravityFrames: [0,19],
                  hits: [{ f:[6,14], x:0, y:24, r:26, dmg:1.4, ang:88, fkb:30, rehit:4, react:'light' },
                         { f:[16,18], x:0, y:40, r:28, dmg:4.3, ang:85, bkb:55, kbg:90 }] },
          airD: { name: '空中下B：氷のネコに変わる', dur: 26, landLag: 8,
                  poses: [[0,'q_ball'],[10,'q_fall'],[26,'q_fall']],
                  events: [{ f:10, swapForm:true }] },
        },
        projectiles: {
          fireball: { type:'fireball', speed:10, life:70, r:11, dmg:4.3, ang:40, bkb:35, kbg:50, elem:'fire' },
        },
      },
      overrides: {},
    },
  ],
};
