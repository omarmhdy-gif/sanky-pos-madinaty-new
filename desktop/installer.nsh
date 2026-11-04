!macro customInstall
  DetailPrint "Setting up the dedicated Sanky POS Windows account and POS-only sign-in..."
  ExecWait '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows-cashier-setup.ps1" -ApplicationPath "$INSTDIR\Sanky POS.exe"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP|MB_OK "Sanky could not configure its dedicated Windows POS account. The setup error was logged to C:\ProgramData\SankyPOS\cashier-setup.log. Please send that log file so the exact cause can be fixed."
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION|MB_OK "The Windows account SankyCashier is ready with password 0000. Sign in to that account from the Windows sign-in screen to open only the Sanky POS app. To return to your normal Windows account, press Ctrl+Alt+Delete and choose Switch user. The installer will now close without opening Sanky POS."
!macroend

!macro customUnInstall
  ExecWait '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows-cashier-setup.ps1" -ApplicationPath "$INSTDIR\Sanky POS.exe" -Remove' $0
!macroend
