@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

set "GRADLE_VERSION=9.6.0"
set "TOOLS_DIR=%~dp0.tools"
set "GRADLE_DIR=%TOOLS_DIR%\gradle-%GRADLE_VERSION%"
set "GRADLE_ZIP=%TOOLS_DIR%\gradle-%GRADLE_VERSION%-bin.zip"
set "GRADLE_URL=https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip"

if not exist "%GRADLE_DIR%\bin\gradle.bat" (
    echo Gradle %GRADLE_VERSION% not found. Downloading...
    if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '%GRADLE_URL%' -OutFile '%GRADLE_ZIP%'"
    if errorlevel 1 (
        echo Failed to download Gradle.
        exit /b 1
    )

    echo Extracting Gradle...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%GRADLE_ZIP%' -DestinationPath '%TOOLS_DIR%' -Force"
    if errorlevel 1 (
        echo Failed to extract Gradle.
        exit /b 1
    )
)

echo Building Фото дня...
call "%GRADLE_DIR%\bin\gradle.bat" assembleDebug
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

for /f "tokens=2 delims=\"" %%V in ('findstr /r /c:"versionName = ".*"" app\build.gradle.kts') do set "VERSION=%%V"

if not defined VERSION (
    echo Could not determine app version.
    exit /b 1
)

if not exist "build-output" mkdir "build-output"
del /q "build-output\photoday-*.apk" 2>nul
copy /y "app\build\outputs\apk\debug\app-debug.apk" "build-output\photoday-!VERSION!.apk" >nul

if errorlevel 1 (
    echo Failed to copy APK.
    exit /b 1
)

echo.
echo Build completed successfully.
echo APK: %~dp0build-output\photoday-!VERSION!.apk
