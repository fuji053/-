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
    minWidth: 600,   // 近いときに映す横幅の最小（小さいほど寄る）
    padX: 360,       // 2人の間の距離に足す余白（横）
    minHeight: 300,  // 映す高さの最小
    padY: 260,       // 高さの余白
    centerPull: 0.12,// ステージの中央にどれだけ寄せるか
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

    /* ---------- 刀（狐の剣士）：小さな体で、刀の先まで届く ---------- */
    katana: {
      jab:   { name: '弱1：抜き打ち', dur: 16, iasa: 13, next: { key:'jab2', f:[3,13] },
               poses: [[0,'kReady'],[2,'kSlash'],[6,'kSlash'],[12,'kReady'],[16,'idle']],
               hits: [{ f:[2,3], x:56, y:62, r:16, dmg:2, ang:20, fkb:28, react:'light' }] },
      jab2:  { name: '弱2：返し斬り', dur: 17, iasa: 14, next: { key:'jab3', f:[3,14] },
               poses: [[0,'kSlash'],[3,'kRise',{tw:-0.4}],[7,'kRise'],[17,'kReady']],
               hits: [{ f:[3,4], x:42, y:86, r:18, dmg:2, ang:30, fkb:30, react:'light' }] },
      jab3:  { name: '弱3：諸手突き', dur: 28, iasa: 24,
               poses: [[0,'kThrustWind'],[5,'kThrust'],[12,'kThrust'],[28,'idle']],
               events: [{ f:[4,8], vx:3 }],
               hits: [{ f:[5,7], x:62, y:58, r:17, dmg:5, ang:38, bkb:55, kbg:62 }] },
      utilt: { name: '上強：三日月斬り', dur: 26, iasa: 22,
               poses: [[0,'kUpWind'],[4,'kRise'],[8,'kUpArc'],[12,'kBack',{t:-5}],[26,'idle']],
               hits: [{ f:[4,6], x:30, y:94, r:20, dmg:6, ang:85, bkb:40, kbg:86 },
                      { f:[7,10], x:0, y:112, r:22, dmg:6, ang:90, bkb:40, kbg:86 }] },
      ftilt: { name: '横強：横一文字', dur: 28, iasa: 24,
               poses: [[0,'kSlashWind'],[6,'kSlash',{tw:0.8}],[13,'kSlash'],[28,'idle']],
               hits: [{ f:[6,8], x:64, y:64, r:15, dmg:9, ang:38, bkb:32, kbg:90 },
                      { f:[6,8], x:42, y:62, r:14, dmg:7, ang:40, bkb:30, kbg:80 }] },
      dtilt: { name: '下強：すね斬り（ダウン）', dur: 22, iasa: 18,
               poses: [[0,'kLowWind'],[5,'kLowSweep'],[12,'kLowSweep'],[22,'crouch']],
               hits: [{ f:[5,7], x:58, y:10, r:17, dmg:6, ang:80, bkb:40, kbg:45, react:'down' }] },

      fsmash:{ name: '横スマ：居合・一閃（刀の先が強い）', dur: 58, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'iaiWind'],[10,'iaiWind'],[14,'iaiSlash'],[26,'iaiSlash'],[58,'kReady']],
               events: [{ f:[12,15], vx:7 }],
               hits: [{ f:[14,15], x:76, y:50, r:13, dmg:20, ang:38, bkb:44, kbg:106 },
                      { f:[14,15], x:50, y:48, r:17, dmg:15, ang:40, bkb:38, kbg:92 }] },
      usmash:{ name: '上スマ：天月（てんげつ）', dur: 54, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'kUpWind'],[8,'kUpWind'],[12,'kRise'],[16,'kUpArc'],[22,'kBack',{t:-10}],[54,'idle']],
               hits: [{ f:[12,14], x:32, y:96, r:22, dmg:15, ang:88, bkb:42, kbg:100 },
                      { f:[15,19], x:0, y:116, r:26, dmg:16, ang:90, bkb:42, kbg:102 }] },
      dsmash:{ name: '下スマ：前後払い', dur: 54, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'kLowWind',{yw:0}],[8,'kLowWind',{yw:0}],[11,'kLowSweep',{yw:0}],[15,'kLowSweep',{yw:180}],[19,'kLowSweep',{yw:360}],[54,'idle',{yw:360}]],
               hits: [{ f:[11,13], x:58, y:10, r:18, dmg:13, ang:30, bkb:38, kbg:96 },
                      { f:[16,18], x:-58, y:10, r:18, dmg:14, ang:150, bkb:38, kbg:98 }] },

      nair:  { name: '空N：旋風斬り', dur: 32, landLag: 7,
               poses: [[0,'fall',{r:0}],[3,'kSlash',{r:0}],[15,'kSlash',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[4,8], x:30, y:45, r:30, dmg:8, ang:45, bkb:30, kbg:80 },
                      { f:[9,14], x:-30, y:45, r:26, dmg:5, ang:135, bkb:25, kbg:60 }] },
      fair:  { name: '空前：袈裟斬り', dur: 30, landLag: 8,
               poses: [[0,'fall'],[3,'kSlashWind'],[7,'kSlash'],[11,'kSlashLow'],[30,'fall']],
               hits: [{ f:[7,10], x:54, y:56, r:22, dmg:9, ang:45, bkb:30, kbg:86 }] },
      bair:  { name: '空後：背面斬り', dur: 32, landLag: 9,
               poses: [[0,'fall'],[3,'kReady'],[7,'kBack'],[16,'kBack'],[32,'fall']],
               hits: [{ f:[7,9], x:-52, y:58, r:20, dmg:11, ang:140, bkb:32, kbg:96 }] },
      uair:  { name: '空上：月面宙返り', dur: 30, landLag: 7,
               poses: [[0,'fall',{r:0}],[3,'tuck',{r:-60}],[6,'kUpArc',{r:-150}],[13,'kUpArc',{r:-250}],[22,'tuck',{r:-360}],[30,'fall',{r:-360}]],
               hits: [{ f:[5,10], x:0, y:104, r:24, dmg:8, ang:85, bkb:32, kbg:86 }] },
      dair:  { name: '空下：下段突き（メテオ）', dur: 38, landLag: 14,
               poses: [[0,'fall'],[4,'tuck'],[10,'kDownThrust'],[20,'kDownThrust'],[38,'fall']],
               hits: [{ f:[10,13], x:6, y:-4, r:17, dmg:12, ang:275, bkb:28, kbg:72 }] },
    },

    /* ---------- スパイ道具（エージェント）：通常技は体術、必殺技は道具 ---------- */
    gadget: {
      jab:   { name: '弱1：ジャブ', dur: 17, iasa: 14, next: { key:'jab2', f:[3,13] },
               poses: [[0,'jabReady'],[2,'punch'],[6,'punch'],[12,'jabReady'],[17,'idle']],
               hits: [{ f:[2,3], x:44, y:72, r:15, dmg:2.5, ang:20, fkb:28, react:'light' }] },
      jab2:  { name: '弱2：ストレート', dur: 19, iasa: 16, next: { key:'jab3', f:[4,15] },
               poses: [[0,'jabReady'],[3,'punch2'],[7,'punch2'],[19,'idle']],
               hits: [{ f:[3,4], x:40, y:70, r:16, dmg:2.5, ang:20, fkb:30, react:'light' }] },
      jab3:  { name: '弱3：ハイキック', dur: 30, iasa: 26,
               poses: [[0,'kickWind'],[5,'roundKick'],[11,'roundKick'],[30,'idle']],
               hits: [{ f:[5,7], x:46, y:58, r:20, dmg:5, ang:40, bkb:55, kbg:65 }] },
      utilt: { name: '上強：振り上げキック', dur: 28, iasa: 24,
               poses: [[0,'kickWind'],[5,'upKick'],[12,'upKick'],[28,'idle']],
               hits: [{ f:[5,9], x:16, y:92, r:22, dmg:8, ang:88, bkb:40, kbg:88 }] },
      ftilt: { name: '横強：ピンヒールキック', dur: 30, iasa: 26,
               poses: [[0,'kickWind'],[7,'kick'],[14,'kick'],[30,'idle']],
               hits: [{ f:[7,9], x:50, y:50, r:16, dmg:10, ang:38, bkb:32, kbg:90 },
                      { f:[7,9], x:28, y:50, r:14, dmg:8, ang:40, bkb:30, kbg:80 }] },
      dtilt: { name: '下強：足払い（ダウン）', dur: 22, iasa: 18,
               poses: [[0,'sweepWind'],[5,'sweep'],[12,'sweep'],[22,'crouch']],
               hits: [{ f:[5,7], x:48, y:12, r:18, dmg:6, ang:80, bkb:40, kbg:45, react:'down' }] },

      fsmash:{ name: '横スマ：後ろ回し蹴り', dur: 60, charge: { f:10, max:60, mul:1.4 },
               poses: [[0,'kickWind',{yw:0}],[10,'kickWind',{yw:0}],[13,'roundKick',{yw:200}],[16,'roundKick',{yw:360}],[30,'roundKick',{yw:360}],[60,'idle',{yw:360}]],
               hits: [{ f:[15,18], x:50, y:58, r:22, dmg:18, ang:38, bkb:42, kbg:104 }] },
      usmash:{ name: '上スマ：天空ハイキック', dur: 56, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'smashUpWind'],[8,'smashUpWind'],[12,'upKick'],[26,'upKick'],[56,'idle']],
               hits: [{ f:[12,16], x:12, y:100, r:26, dmg:16, ang:88, bkb:42, kbg:100 },
                      { f:[12,13], x:24, y:50, r:20, dmg:10, ang:90, bkb:48, kbg:80 }] },
      dsmash:{ name: '下スマ：開脚キック', dur: 56, charge: { f:8, max:60, mul:1.4 },
               poses: [[0,'crouch'],[8,'crouch'],[12,'splitKick'],[24,'splitKick'],[56,'idle']],
               hits: [{ f:[12,15], x:44, y:8, r:20, dmg:14, ang:30, bkb:40, kbg:96 },
                      { f:[12,15], x:-44, y:8, r:20, dmg:14, ang:150, bkb:40, kbg:96 }] },

      nair:  { name: '空N：開脚旋回キック', dur: 34, landLag: 8,
               poses: [[0,'fall'],[4,'nairSpread'],[20,'nairSpread'],[34,'fall']],
               hits: [{ f:[5,8], x:40, y:30, r:24, dmg:9, ang:45, bkb:30, kbg:80 },
                      { f:[5,8], x:-40, y:30, r:24, dmg:9, ang:135, bkb:30, kbg:80 },
                      { f:[9,18], x:0, y:30, r:40, dmg:5, ang:45, bkb:25, kbg:60 }] },
      fair:  { name: '空前：前蹴り', dur: 32, landLag: 9,
               poses: [[0,'fall'],[3,'kickWind'],[7,'kick'],[16,'kick'],[32,'fall']],
               hits: [{ f:[7,10], x:48, y:48, r:19, dmg:10, ang:45, bkb:30, kbg:86 }] },
      bair:  { name: '空後：ヒールバック', dur: 34, landLag: 10,
               poses: [[0,'fall'],[3,'backKickWind'],[7,'backKick'],[16,'backKick'],[34,'fall']],
               hits: [{ f:[7,9], x:-48, y:46, r:20, dmg:12, ang:140, bkb:32, kbg:98 }] },
      uair:  { name: '空上：サマーソルト', dur: 32, landLag: 8,
               poses: [[0,'fall',{r:0}],[4,'tuck',{r:-60}],[7,'upKick',{r:-150}],[14,'upKick',{r:-250}],[24,'tuck',{r:-360}],[32,'fall',{r:-360}]],
               hits: [{ f:[6,10], x:0, y:106, r:26, dmg:9, ang:85, bkb:32, kbg:88 }] },
      dair:  { name: '空下：かかと落とし（メテオ）', dur: 40, landLag: 15,
               poses: [[0,'fall'],[4,'heelDrop'],[11,'heelDropDown'],[22,'heelDropDown'],[40,'fall']],
               hits: [{ f:[11,14], x:22, y:2, r:18, dmg:12, ang:280, bkb:30, kbg:72 }] },
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
      portrait: 'face_fist.jpg', // キャラ選択の絵
      model: 'wrestler.glb', // 3Dモデル（Higgsfieldで作成）
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

    /* ===== 7：狐の剣士（近距離・スピード・刀）小さくて速い ===== */
    {
      id: 'fox', no: 7, name: '狐の剣士', range: '近距離', type: 'スピード', weapon: 'katana',
      portrait: 'face_fox.jpg', // キャラ選択の絵
      model: 'fox.glb', // 3Dモデル（Higgsfieldで作成・Blenderでしっぽとマフラーの骨を追加）
      stats: { weight: 80, walk: 3.8, run: 8.4, air: 4.5, airAccel: 0.52, jump: 15.8, djump: 15,
               gravity: 0.62, fall: 10.8, airJumps: 1, dmgMul: 0.95, kbMul: 1.0, speed: 1.1 },
      look: { thick: 5.5, head: 9, scale: 0.8 }, // scale：体の大きさ（0.8 = 2割小さい。くらう範囲も小さくなる）
      cpu: { style: 'mid', range: 70, counter: true },
      specials: {
        /* --- 地上 --- */
        n:    { name: 'NB：飛燕（ひえん）斬撃波', dur: 34,
                poses: [[0,'kSlashWind'],[8,'kSlash',{tw:0.8}],[16,'kSlash'],[34,'kReady']],
                events: [{ f:9, proj:'wave', ang:0, x:40, y:55 }] },
        side: { name: '横B：疾風斬り', dur: 40,
                poses: [[0,'iaiWind'],[5,'iaiSlash'],[16,'iaiSlash'],[40,'kReady']],
                events: [{ f:[5,15], vx:10 }],
                hits: [{ f:[6,15], x:48, y:48, r:22, dmg:9, ang:40, bkb:50, kbg:62 }] },
        up:   { name: '上B：昇竜斬り', dur: 44, helpless: true, landLag: 18,
                poses: [[0,'kUpWind',{yw:0}],[4,'kUpArc',{yw:0}],[18,'kUpArc',{yw:720}],[28,'kUpArc',{yw:720}],[44,'helpless',{yw:720}]],
                events: [{ f:[4,19], vy:16, vx:1.5 }, { f:20, vy:3 }],
                gravityFrames: [0,20],
                hits: [{ f:[4,15], x:10, y:90, r:20, dmg:2, ang:88, bkb:20, kbg:8, rehit:4, react:'light' },
                       { f:[16,18], x:10, y:100, r:24, dmg:5, ang:80, bkb:55, kbg:75, rehit:2 }] },
        down: { name: '下B：見切り（カウンター）', dur: 46,
                counter: { f:[4,24], mul:1.3, min:8, ang:40, bkb:45, kbg:85 },
                poses: [[0,'kCounter'],[24,'kCounter'],[46,'idle']] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中飛燕', dur: 34, landLag: 10, gravityMul: 0.5,
                poses: [[0,'kSlashWind'],[8,'kSlash',{tw:0.8}],[16,'kSlash'],[34,'fall']],
                events: [{ f:9, proj:'wave', ang:0, x:40, y:55 }] },
        airF: { name: '空中前B：空中疾風斬り', dur: 40, landLag: 12, oncePerAir: true, gravityMul: 0.1,
                poses: [[0,'iaiWind'],[5,'iaiSlash'],[16,'iaiSlash'],[40,'fall']],
                events: [{ f:0, vy:1 }, { f:[5,16], vx:11 }],
                hits: [{ f:[6,16], x:48, y:48, r:22, dmg:8, ang:45, bkb:48, kbg:58 }] },
        airB: { name: '空中後B：振り向き居合', dur: 38, landLag: 12,
                poses: [[0,'iaiWind'],[10,'iaiSlash'],[20,'iaiSlash'],[38,'fall']],
                events: [{ f:2, turn:true }],
                hits: [{ f:[10,12], x:66, y:50, r:20, dmg:14, ang:40, bkb:38, kbg:96 }] },
        airU: { name: '空中上B：昇竜斬り', dur: 44, helpless: true, landLag: 18,
                poses: [[0,'kUpWind',{yw:0}],[4,'kUpArc',{yw:0}],[18,'kUpArc',{yw:720}],[28,'kUpArc',{yw:720}],[44,'helpless',{yw:720}]],
                events: [{ f:[4,19], vy:17, vx:2 }, { f:20, vy:3 }],
                gravityFrames: [0,20],
                hits: [{ f:[4,15], x:10, y:90, r:20, dmg:2, ang:88, bkb:20, kbg:8, rehit:4, react:'light' },
                       { f:[16,18], x:10, y:100, r:24, dmg:5, ang:80, bkb:55, kbg:75, rehit:2 }] },
        airD: { name: '空中下B：落鷹（らくよう）急降下斬り（メテオ）', dur: 48, landLag: 22,
                poses: [[0,'tuck'],[8,'kDive'],[48,'kDive']],
                events: [{ f:0, vy:4 }, { f:[8,40], vy:-13, vx:6 }],
                gravityFrames: [0,40],
                hits: [{ f:[8,40], x:40, y:30, r:22, dmg:11, ang:280, bkb:35, kbg:70 }] },
      },
      throws: {
        fthrow: { name: '前投げ：斬り払い', dur: 28, release: 11, poses: [[0,'hold'],[6,'kSlashWind'],[11,'kSlash'],[28,'idle']],
                  held: [[0,30,0,0],[11,40,8,0]], hit: { dmg:8, ang:40, bkb:55, kbg:62 } },
        bthrow: { name: '後ろ投げ：背負い投げ', dur: 32, release: 13, poses: [[0,'hold'],[7,'throwUp'],[13,'throwDown'],[32,'idle']],
                  events: [{ f:0, turn:true }],
                  held: [[0,-30,0,0],[7,-5,60,-90],[13,36,8,-180]], hit: { dmg:10, ang:42, bkb:60, kbg:72 } },
        uthrow: { name: '上投げ：斬り上げ', dur: 32, release: 12, poses: [[0,'hold'],[6,'kUpWind'],[12,'kUpArc'],[32,'idle']],
                  held: [[0,30,0,0],[12,6,80,0]], hit: { dmg:7, ang:90, bkb:65, kbg:70 } },
        dthrow: { name: '下投げ：たたきつけ突き', dur: 34, release: 14, poses: [[0,'hold'],[8,'kSlashWind'],[14,'kDownThrust'],[34,'idle']],
                  held: [[0,30,0,0],[14,28,-2,0]], hit: { dmg:6, ang:80, bkb:55, kbg:35 } },
      },
      projectiles: {
        wave: { type:'wave', speed:11, life:24, r:20, dmg:7, ang:40, bkb:30, kbg:55, max:1 },
      },
      overrides: {},
    },

    /* ===== 14：弓使い（遠距離・バランス・弓） ===== */
    {
      id: 'bow', no: 14, name: '弓使い', range: '遠距離', type: 'バランス', weapon: 'bow',
      portrait: 'face_bow.jpg', // キャラ選択の絵
      model: 'archer.glb', // 3Dモデル（Higgsfieldで作成・Blenderで髪と布の骨を追加）
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

    /* ===== 16：エージェント（遠距離・トラップ・スパイ道具） ===== */
    {
      id: 'agent', no: 16, name: 'エージェント', range: '遠距離', type: 'トラップ', weapon: 'gadget',
      portrait: 'face_agent.jpg', // キャラ選択の絵
      model: 'agentA.glb',  // 3Dモデル（スーツ・サングラス）
      model2: 'agentB.glb', // ％が swapPct を超えると、この姿（ジャケットとサングラスなし）に変わる
      swapPct: 100,
      stats: { weight: 88, walk: 3.5, run: 6.6, air: 4.0, airAccel: 0.44, jump: 15, djump: 14,
               gravity: 0.56, fall: 9.8, airJumps: 1, dmgMul: 1.0, kbMul: 1.0, speed: 1.04 },
      look: { thick: 5.5, head: 10 },
      cpu: { style: 'zone', range: 300, mine: true },
      specials: {
        /* --- 地上 --- */
        // holdShot = Bを押している間ためて、離すと発射（min = ためなし、max2 = 最大ため）
        n:    { name: 'NB：サイレンサー・ため撃ち', dur: 32,
                holdShot: { f:6, max:80, over:30, min:{ dmg:3, speed:22, bkb:20, kbg:35 }, max2:{ dmg:15, speed:32, bkb:40, kbg:88 } },
                poses: [[0,'gunAim'],[6,'gunAim'],[9,'gunFire'],[32,'idle']],
                events: [{ f:9, proj:'bullet', shot:true, ang:0, x:42, y:74 }] },
        side: { name: '横B：ワイヤーフック（引き寄せ）', dur: 46, wire: [4, 30],
                poses: [[0,'wireThrow'],[10,'wireThrow'],[20,'pull'],[46,'idle']],
                hits: [{ f:[10,14], x:150, y:72, r:18, dmg:4, pull:true }] },
        up:   { name: '上B：ワイヤー上昇', dur: 44, helpless: true, landLag: 18, wire: [3, 24], wireTip: [70, 210],
                poses: [[0,'wireUp'],[24,'wireUp'],[30,'jump'],[44,'helpless']],
                events: [{ f:[6,24], vy:14, vx:2 }, { f:25, vy:4 }],
                gravityFrames: [0,25],
                hits: [{ f:[5,9], x:66, y:190, r:24, dmg:6, ang:80, bkb:50, kbg:60 }] },
        down: { name: '下B：地雷セット（1個まで）', dur: 34,
                poses: [[0,'crouch'],[8,'placeMine'],[18,'placeMine'],[34,'idle']],
                events: [{ f:12, proj:'mine', x:40, y:0 }] },
        /* --- 空中 --- */
        airN: { name: '空中NB：空中ため撃ち', dur: 32, landLag: 10, gravityMul: 0.25,
                holdShot: { f:6, max:60, over:20, min:{ dmg:3, speed:22, bkb:20, kbg:35 }, max2:{ dmg:13, speed:30, bkb:38, kbg:82 } },
                poses: [[0,'gunAim'],[6,'gunAim'],[9,'gunFire'],[32,'fall']],
                events: [{ f:9, proj:'bullet', shot:true, ang:0, x:42, y:74 }] },
        airF: { name: '空中前B：空中ワイヤーフック', dur: 44, landLag: 12, gravityMul: 0.3, wire: [4, 30],
                poses: [[0,'wireThrow'],[10,'wireThrow'],[20,'pull'],[44,'fall']],
                hits: [{ f:[10,14], x:150, y:72, r:18, dmg:4, pull:true }] },
        airB: { name: '空中後B：煙幕弾', dur: 36, landLag: 10,
                poses: [[0,'wireThrow'],[12,'release'],[36,'fall']],
                events: [{ f:2, turn:true }, { f:12, proj:'smoke', ang:25, x:30, y:70 }] },
        airU: { name: '空中上B：ワイヤー上昇', dur: 44, helpless: true, landLag: 18, wire: [3, 24], wireTip: [70, 210],
                poses: [[0,'wireUp'],[24,'wireUp'],[30,'jump'],[44,'helpless']],
                events: [{ f:[6,24], vy:15.5, vx:2 }, { f:25, vy:4 }],
                gravityFrames: [0,25],
                hits: [{ f:[5,9], x:66, y:190, r:24, dmg:6, ang:80, bkb:50, kbg:60 }] },
        airD: { name: '空中下B：反射ガジェット（1.4倍）', dur: 36, landLag: 10, gravityMul: 0.25,
                reflect: { f:[4,24], x:24, y:55, r:58, mul:1.4 },
                poses: [[0,'gunAim'],[4,'guard'],[24,'guard'],[36,'fall']],
                events: [{ f:0, vy:2 }] },
      },
      throws: {
        fthrow: { name: '前投げ：前蹴り', dur: 28, release: 11, poses: [[0,'hold'],[6,'kickWind'],[11,'kick'],[28,'idle']],
                  held: [[0,36,0,0],[11,48,10,0]], hit: { dmg:8, ang:40, bkb:55, kbg:62 } },
        bthrow: { name: '後ろ投げ：巴投げ', dur: 34, release: 14, poses: [[0,'hold'],[7,'throwUp'],[14,'throwDown'],[34,'idle']],
                  events: [{ f:0, turn:true }],
                  held: [[0,-36,0,0],[7,-5,70,-90],[14,40,10,-180]], hit: { dmg:10, ang:40, bkb:60, kbg:72 } },
        uthrow: { name: '上投げ：打ち上げて撃つ', dur: 40, release: 10, poses: [[0,'hold'],[10,'throwUp'],[15,'gunAim',{fa1:150,ba1:140}],[19,'gunFire',{fa1:160,ba1:150}],[40,'idle']],
                  held: [[0,36,0,0],[10,10,90,0]], hit: { dmg:4, ang:90, bkb:75, kbg:45 },
                  events: [{ f:19, proj:'bullet', ang:88, x:0, y:110, speed:24, dmg:5, kang:88, bkb:40, kbg:60 }] },
        dthrow: { name: '下投げ：踏みつけ', dur: 34, release: 14, poses: [[0,'hold'],[6,'stompWind'],[14,'stompDown'],[34,'idle']],
                  held: [[0,36,0,0],[14,34,-2,0]], hit: { dmg:7, ang:82, bkb:58, kbg:40, react:'down' } },
      },
      /* ===== 覚醒（％が swapPct を超えたとき）=====
         ジャケットとサングラスを外した姿になり、全部の技が強化版に変わる。撃墜されると元に戻る
         dmgMul：全部の技の攻撃力の倍率（1.5 = 1.5倍） / speedMul：技の速さの倍率 */
      awaken: {
        dmgMul: 1.5, speedMul: 1.12,
        // 強化版の必殺技（ここに書いた技だけ入れかわる）
        specials: {
          n:    { name: 'NB【覚醒】ダブルタップ（2連射・最大ためは貫通）', dur: 38,
                  holdShot: { f:6, max:50, over:30, min:{ dmg:3, speed:24, bkb:20, kbg:35 }, max2:{ dmg:14, speed:34, bkb:40, kbg:86 } },
                  poses: [[0,'gunAim'],[6,'gunAim'],[9,'gunFire'],[13,'gunAim'],[16,'gunFire'],[38,'idle']],
                  events: [{ f:9, proj:'bullet', shot:true, ang:0, x:42, y:74 }, { f:16, proj:'bullet', shot:true, ang:0, x:42, y:74 }] },
          side: { name: '横B【覚醒】ショックワイヤー（引き寄せて電撃）', dur: 50, wire: [4, 30],
                  poses: [[0,'wireThrow'],[10,'wireThrow'],[20,'pull'],[24,'punch'],[30,'punch'],[50,'idle']],
                  hits: [{ f:[10,14], x:150, y:72, r:18, dmg:4, pull:true },
                         { f:[23,27], x:44, y:62, r:28, dmg:6, ang:45, bkb:55, kbg:62, rehit:10, elec:true }] },
          up:   { name: '上B【覚醒】ワイヤー急上昇', dur: 44, helpless: true, landLag: 16, wire: [3, 24], wireTip: [70, 230],
                  poses: [[0,'wireUp'],[24,'wireUp'],[30,'jump'],[44,'helpless']],
                  events: [{ f:[6,24], vy:15.5, vx:2.5 }, { f:25, vy:4 }],
                  gravityFrames: [0,25],
                  hits: [{ f:[5,10], x:66, y:205, r:28, dmg:9, ang:80, bkb:55, kbg:66, elec:true }] },
          down: { name: '下B【覚醒】地雷セット（2個まで・大爆発）', dur: 32,
                  poses: [[0,'crouch'],[8,'placeMine'],[18,'placeMine'],[32,'idle']],
                  events: [{ f:12, proj:'mine', x:40, y:0 }] },
          airN: { name: '空中NB【覚醒】空中ダブルタップ', dur: 38, landLag: 10, gravityMul: 0.25,
                  holdShot: { f:6, max:44, over:20, min:{ dmg:3, speed:24, bkb:20, kbg:35 }, max2:{ dmg:12, speed:32, bkb:38, kbg:80 } },
                  poses: [[0,'gunAim'],[6,'gunAim'],[9,'gunFire'],[13,'gunAim'],[16,'gunFire'],[38,'fall']],
                  events: [{ f:9, proj:'bullet', shot:true, ang:0, x:42, y:74 }, { f:16, proj:'bullet', shot:true, ang:0, x:42, y:74 }] },
          airF: { name: '空中前B【覚醒】空中ショックワイヤー', dur: 48, landLag: 12, gravityMul: 0.3, wire: [4, 30],
                  poses: [[0,'wireThrow'],[10,'wireThrow'],[20,'pull'],[24,'punch'],[30,'punch'],[48,'fall']],
                  hits: [{ f:[10,14], x:150, y:72, r:18, dmg:4, pull:true },
                         { f:[23,27], x:44, y:62, r:28, dmg:6, ang:45, bkb:55, kbg:62, rehit:10, elec:true }] },
          airU: { name: '空中上B【覚醒】ワイヤー急上昇', dur: 44, helpless: true, landLag: 16, wire: [3, 24], wireTip: [70, 230],
                  poses: [[0,'wireUp'],[24,'wireUp'],[30,'jump'],[44,'helpless']],
                  events: [{ f:[6,24], vy:17, vx:2.5 }, { f:25, vy:4 }],
                  gravityFrames: [0,25],
                  hits: [{ f:[5,10], x:66, y:205, r:28, dmg:9, ang:80, bkb:55, kbg:66, elec:true }] },
          airD: { name: '空中下B【覚醒】反射ガジェット（2倍）', dur: 36, landLag: 10, gravityMul: 0.25,
                  reflect: { f:[4,26], x:24, y:55, r:66, mul:2.0 },
                  poses: [[0,'gunAim'],[4,'guard'],[26,'guard'],[36,'fall']],
                  events: [{ f:0, vy:2 }] },
        },
        // 強化版の通常技（ここに書いた技は丸ごと入れかわる）
        moves: {
          jab3: { name: '弱3【覚醒】3連キック', dur: 40, iasa: 36,
                  poses: [[0,'kickWind'],[4,'kick'],[8,'kickWind'],[12,'roundKick'],[17,'kickWind',{yw:0}],[20,'roundKick',{yw:360}],[28,'roundKick',{yw:360}],[40,'idle',{yw:360}]],
                  hits: [{ f:[4,5], x:46, y:50, r:18, dmg:2.5, ang:30, fkb:32, react:'light' },
                         { f:[12,13], x:46, y:58, r:18, dmg:2.5, ang:30, fkb:32, react:'light', rehit:6 },
                         { f:[20,22], x:50, y:60, r:22, dmg:4, ang:40, bkb:58, kbg:70, rehit:6 }] },
        },
        projectiles: {
          bullet: { type:'bullet', speed:24, life:40, r:8, dmg:3, ang:30, bkb:20, kbg:40, pierce:true }, // 最大ためは相手をつらぬく
          mine:   { type:'mine', life:720, arm:30, r:30, dmg:15, ang:80, bkb:66, kbg:76, max:2, replace:true, boom:140 },
          smoke:  { type:'smoke', speed:6, grav:0.35, life:240, r:12, cloudR:85, cloudLife:200, dmg:1.5, rehit:12, ang:85, fkb:22, react:'light' },
        },
      },
      projectiles: {
        bullet: { type:'bullet', speed:22, life:40, r:7, dmg:3, ang:30, bkb:20, kbg:40 },
        // 地雷：置いてから arm コマで準備完了。相手がふれると爆発（1個まで。新しく置くと古いのは消える）
        mine:   { type:'mine', life:720, arm:36, r:22, dmg:13, ang:80, bkb:62, kbg:72, max:1, replace:true },
        // 煙幕弾：投げて地面か一定時間で煙になり、中にいる相手に小さなダメージが続く
        smoke:  { type:'smoke', speed:6, grav:0.35, life:150, r:12, cloudR:58, dmg:1.5, rehit:14, ang:85, fkb:22, react:'light' },
      },
      overrides: {},
    },
  ],
};
