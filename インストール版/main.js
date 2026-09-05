const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

// ---- プリセットの初回セットアップ ----
// インストール先(Program Files配下など)は通常のユーザー権限では書き込みができない
// 保護された場所なので、そこにあるpresetsフォルダを「フォルダを選ぶ」で直接指定すると、
// 書き込み許可の要求(requestPermission)がそのまま応答なしで固まってしまう。
// そのため、アプリに同梱したプリセット(resources/presets、読み取り専用として同梱)を、
// 初回起動時にユーザーの書き込み可能な場所(デスクトップ配下)へコピーしておく。
// 既にコピー先が存在する場合は上書きしない(ユーザーが追加/編集した内容を守るため)。
function ensureWritablePresetsFolder() {
  const bundledPresetsDir = app.isPackaged
    ? path.join(process.resourcesPath, "presets")
    : path.join(__dirname, "presets");
  const targetDir = path.join(app.getPath("desktop"), "卓球ラリーシミュレーター", "presets");

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    if (fs.existsSync(bundledPresetsDir)) {
      for (const name of fs.readdirSync(bundledPresetsDir)) {
        const destPath = path.join(targetDir, name);
        // 既にファイルがある場合は上書きしない(ユーザーの編集内容を優先する)
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(path.join(bundledPresetsDir, name), destPath);
        }
      }
    }
  } catch (e) {
    console.error("プリセットの初回セットアップに失敗しました:", e);
  }
  return targetDir;
}

// ブラウザ版で使えていた画面全体の拡大/縮小(Ctrl+ +/-/0、Macは⌘)を、
// Electron版でも使えるようにする。メニューバー自体は画面のどこにも一切表示せず、
// ショートカットキー(accelerator)だけを登録する目的でMenuを使う
// (Menuオブジェクトを作ってsetApplicationMenu()しておけば、そこに登録した
// ショートカットキーはメニューバーを一切表示しなくても有効になる)。
// role:"zoomIn"/"zoomOut"/"resetZoom"はElectron側で用意されている既定の動作で、
// ページ全体(HTML/canvasごと)を拡大/縮小する(ブラウザのCtrl+ +/-と同じ)。
const menu = Menu.buildFromTemplate([
  {
    label: "表示",
    submenu: [
      // 既定のショートカットキー：拡大=Ctrl(⌘)+Shift+"+"、縮小=Ctrl(⌘)+"-"、
      // リセット=Ctrl(⌘)+0。Electron側の標準ロールなのでOS標準のズーム操作感になる
      { role: "zoomIn" },
      { role: "zoomOut" },
      { role: "resetZoom" },
    ],
  },
]);
Menu.setApplicationMenu(menu);

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 1000,
    minWidth: 1000,
    minHeight: 700,
    icon: path.join(__dirname, "build", "icon.ico"), // 開発時(npm start)のウィンドウアイコン。配布用exe自体のアイコンはpackage.jsonのbuild.win.iconで指定
    webPreferences: {
      // このアプリはネット通信を一切行わないローカル完結アプリなので、
      // Node.js機能を有効にする必要はない(セキュリティのため既定のまま無効にしておく)
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // メニューバーは常に非表示にする。autoHideMenuBar(Altキーで一時表示)は使わない
  // ことで、Altキーを押してもメニューバーが出てこないようにする
  // (「見慣れないメニューが急に出てくる」という分かりにくさを避けるため)。
  // Menu自体はsetApplicationMenu()で登録済みなので、ズームのショートカットキー
  // (Ctrl+ +/-/0)はメニューバーが出てこなくても引き続き有効。
  win.setMenuBarVisibility(false);

  win.loadFile("index.html");

  // Ctrl(⌘)+マウスホイールでも拡大/縮小できるようにする(ブラウザと同じ操作感)。
  // 通常のホイール操作(縦スクロールなど)には一切影響しない。
  win.webContents.on("zoom-changed", (event, zoomDirection) => {
    const current = win.webContents.getZoomLevel();
    win.webContents.setZoomLevel(current + (zoomDirection === "in" ? 0.5 : -0.5));
  });
}

app.whenReady().then(() => {
  const presetsTargetDir = path.join(app.getPath("desktop"), "卓球ラリーシミュレーター", "presets");
  const isFirstRun = !fs.existsSync(presetsTargetDir);
  ensureWritablePresetsFolder();

  createWindow();

  if (isFirstRun) {
    // 初回起動時だけ、プリセットフォルダをデスクトップ配下に用意したことを
    // メッセージで知らせ、そのままエクスプローラー(Finder)で開く。
    // (何の説明もなくフォルダが勝手に開くと戸惑うため、先に一言添える)
    dialog.showMessageBox({
      type: "info",
      title: "プリセットフォルダを用意しました",
      message: "プリセットフォルダを用意しました",
      detail:
        `同梱のプリセットを、書き込み可能な次の場所にコピーしました。\n\n${presetsTargetDir}\n\n` +
        `アプリの「フォルダを選ぶ」でこのフォルダを選ぶと、プリセットが使えるようになります。\n` +
        `（このあとフォルダを開きます）`,
      buttons: ["OK"],
    }).then(() => {
      shell.openPath(presetsTargetDir);
    });
  }

  app.on("activate", () => {
    // Mac固有の作法：Dockアイコンをクリックした時、ウィンドウが1つも無ければ再度開く
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Mac固有の作法：ウィンドウを全部閉じてもDockにアプリを残す(他OSは通常通り終了)
  if (process.platform !== "darwin") app.quit();
});
