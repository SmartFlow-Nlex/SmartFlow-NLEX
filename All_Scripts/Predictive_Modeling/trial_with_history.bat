@echo off
cd /d "%~dp0"
"C:\Users\Kiarra Jem Dela Cruz\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\python.exe" -u train_congestion_horizon.py --dry-run --fast --with-history > "%~dp0trial_with_history.log" 2>&1

