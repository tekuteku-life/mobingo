# Pixelの振動切り分け

## 確認済みの範囲

当初、Pixel 9aのインストール済みPWAと通常Chromeタブで振動しないとの報告があった。アプリの振動設定はオン、APIは対応、確認操作の要求結果はrequestedである。Chrome公式の500ms振動サンプルでも振動しない。消音・集中モード解除、通常・強力なバッテリーセーバーの両方オフは確認済みである。追加回答では、メディア以外のハプティクスをオフにしている。以前の「強度最大」という回答を、操作時の振動も有効であるという意味には扱わない。

2026年11月3日の実機確認で、メディアのバイブレーションのオン・オフでは変化せず、タッチフィードバックのオン・オフで振動が変わったとの回答を得た。今回の端末での無反応は、操作用の振動が設定で抑制されていたことに対応する。OSの内部ログは採取していないため、抑制状態を表す内部statusまで直接観測したとは扱わない。

メディア振動は音楽・映像などの用途、タッチフィードバックはタップ・ドラッグなどの操作用途に対する別の強度・有効設定である。今回のChrome経路では短いパルスがTOUCH用途へ分類されるため、Mobingoでは端末のタッチフィードバックとアプリ内の振動の両方を有効にする。現在使用するWeb APIにはAndroidの用途をMEDIAへ指定する引数はない。

ブラウザーの受付結果から物理振動やOSの許可を判断しない。JavaScriptはAndroidの抑制理由、VIBRATE権限、AppOpsの状態を取得できず、Androidの振動用途や制限を変更することもできない。

## ソースから分かること

Chromiumの[VibrationController](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/vibration/vibration_controller.cc)は表示・利用者操作を確認した後、非同期のネイティブ要求より先にtrueを返す。したがってrequestedはネイティブやOSの成功通知ではない。

Chromiumの[Android側](https://github.com/chromium/chromium/blob/main/services/device/vibration/android/java/src/org/chromium/device/vibration/VibrationManagerAndroid.java)は消音とVIBRATE権限を確認し、旧形式のVibrator.vibrate(milliseconds)を呼ぶ。Androidの[Vibrator](https://github.com/aosp-mirror/platform_frameworks_base/blob/android16-release/core/java/android/os/Vibrator.java)はこれを用途未指定の単発効果へ変換する。

Androidの[VibratorManagerService](https://github.com/aosp-mirror/platform_frameworks_base/blob/android16-release/services/core/java/com/android/server/vibrator/VibratorManagerService.java)は短い効果をTOUCH用途へ補正する。200msの確認と公式サンプルの500msは、AOSPの長さ・セグメント条件ではこの対象となる。Chromiumは複数回の振動もパルスごとに要求するため、樽回し全体の長さだけで用途を判断しない。

[VibrationSettings](https://github.com/aosp-mirror/platform_frameworks_base/blob/android16-release/services/core/java/com/android/server/vibrator/VibrationSettings.java)は前面状態、用途別強度、グローバル振動、電力制限などを判定する。未補正のUNKNOWN用途にはメディア強度を使うが、短い操作振動を一律にメディア設定の問題とは扱わない。[AppOps判定](https://github.com/aosp-mirror/platform_frameworks_base/blob/android16-release/services/core/java/com/android/server/vibrator/VibratorManagerService.java)も独立して存在する。用途分類とタッチ設定の関係は実機の切替結果と整合する。他の抑制条件をこの端末の原因として観測した結果ではない。

## 確認結果と再発時の切り分け

メディア以外がオフという設定と短い振動のTOUCH分類を調べ、タッチフィードバックの切替により実際の振動が変わることを利用者が確認した。今回の設定由来の無反応は切り分け済みである。長い振動へ勝手に変更して設定を迂回しない。

触覚フィードバックをオンにしても出ない場合は、ホーム画面のアイコン長押しなどChrome以外の操作振動と、下記のOS記録を確認する。着信・アラームは用途と優先度が異なるため、操作振動の代替確認にはしない。

Chrome以外では操作振動が出る場合は、Chromeのネイティブ要求とAndroid側の拒否記録を優先して調べる。全体で出ない場合はOSの操作振動・機器側を優先する。いずれも根本原因の確定ではない。

## USB接続したAndroidの読み取り確認

PCにAndroid Platform Toolsを導入し、対象端末でUSBデバッグを許可した場合の手順である。Chrome標準版のパッケージ名を例示する。Chrome Betaなどは対象パッケージを合わせる。

```sh
adb devices -l
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell cmd appops get com.android.chrome VIBRATE
adb shell settings get global low_power
adb shell settings get system vibrate_on
adb shell settings get system haptic_feedback_enabled
adb shell settings get system haptic_feedback_intensity
adb shell settings get system media_vibration_intensity
```

未設定値やAppOpsの履歴なしを、拒否や故障と断定しない。OS版やベンダーによって保存キー・表示形式は異なる。

端末でアプリ情報の「振動を試す」を1回押し、直後に次を実行する。

```sh
adb shell dumpsys vibrator_manager > vibrator-after.txt
```

端末内で得た記録から、Chromeに対応する要求の用途、status、強度、VibrationSettingsを確認する。IGNORED_FOR_SETTINGS、IGNORED_APP_OPS、IGNORED_BACKGROUNDなどの実際の理由を採取できた場合に限り、その経路を原因として絞る。要求自体がなければブラウザーからOSまでの経路を調べる。FINISHEDも物理出力の証明にはしない。

取得ファイルには他アプリの振動履歴が含まれ得るため、共有する場合はChromeの該当記録と関連設定だけを抜粋する。アプリはこのログを取得・送信しない。権限やAppOps、システム設定の変更コマンドは使わない。
