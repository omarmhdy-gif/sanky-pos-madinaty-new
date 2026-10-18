!macro customInstall
  DetailPrint "Setting up the dedicated Sanky POS Windows account and POS-only sign-in..."
  ExecWait '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows-cashier-setup.ps1" -ApplicationPath "$INSTDIR\Sanky POS.exe"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP|MB_OK "Sanky could not configure its dedicated Windows POS account. The setup error was logged to C:\ProgramData\SankyPOS\cashier-setup.log. Please send that log file so the exact cause can be fixed."
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION|MB_OK "The Sanky Windows account now opens only the POS app. Press Ctrl+Alt+Delete and choose Switch user to use Windows with your normal account. Restart Windows to start Sanky automatically."
!macroend

!macro customUnInstall
  ExecWait '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\windows-cashier-setup.ps1" -ApplicationPath "$INSTDIR\Sanky POS.exe" -Remove' $0
!macroend
