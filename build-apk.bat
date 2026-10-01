@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "GRADLE_VERSION=9.6.0"
set "TOOLS_DIR=%~dp0.tools"
set "GRADLE_DIR=%TOOLS_DIR%\gradle-%GRADLE_VERSION%"
set "GRADLE_ZIP=%TOOLS_DIR%\gradle-%GRADLE_VERSION%-bin.zip"
set "GRADLE_URL=https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip"

rem Validate the existing JAVA_HOME first. Ignore a stale/broken value.
set "DETECTED_JAVA_HOME="
if defined JAVA_HOME if exist "%JAVA_HOME%\bin\java.exe" set "DETECTED_JAVA_HOME=%JAVA_HOME%"

rem If JAVA_HOME is invalid, try java.exe from PATH.
if not defined DETECTED_JAVA_HOME (
    for /f "delims=" %%J in ('where java 2^>nul') do if not defined DETECTED_JAVA_HOME (
        for %%D in ("%%J") do set "DETECTED_JAVA_HOME=%%~dpD.."
    )
)

rem Android Studio normally includes its own JDK.
if not defined DETECTED_JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "DETECTED_JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined DETECTED_JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jre\bin\java.exe" set "DETECTED_JAVA_HOME=%ProgramFiles%\Android\Android Studio\jre"

rem Last resort: download a portable JDK 17 into .tools.
if not defined DETECTED_JAVA_HOME (
    set "JDK_ROOT=%TOOLS_DIR%\jdk17"
    if not exist "!JDK_ROOT!" mkdir "!JDK_ROOT!"
    if not exist "!JDK_ROOT!\bin\java.exe" (
        echo Java 17 not found. Downloading a portable JDK 17...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile '%TOOLS_DIR%\jdk17.zip'"
        if errorlevel 1 (
            echo Failed to download JDK 17.
            exit /b 1
        )
        echo Extracting JDK 17...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TOOLS_DIR%\jdk17.zip' -DestinationPath '%TOOLS_DIR%\jdk17' -Force"
        if errorlevel 1 (
            echo Failed to extract JDK 17.
            exit /b 1
        )
    )
    for /d %%D in ("!JDK_ROOT!\jdk-*") do if not defined DETECTED_JAVA_HOME if exist "%%D\bin\java.exe" set "DETECTED_JAVA_HOME=%%D"
    if not defined DETECTED_JAVA_HOME if exist "!JDK_ROOT!\bin\java.exe" set "DETECTED_JAVA_HOME=!JDK_ROOT!"
)

if not defined DETECTED_JAVA_HOME (
    echo Java 17 or newer was not found and could not be installed automatically.
    exit /b 1
)

set "JAVA_HOME=!DETECTED_JAVA_HOME!"
set "PATH=!JAVA_HOME!\bin;%PATH%"

echo Using Java:
"!JAVA_HOME!\bin\java.exe" -version
if errorlevel 1 (
    echo Java installation is not usable.
    exit /b 1
)

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

echo Building Foto dnia...
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
