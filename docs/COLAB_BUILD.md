# Build Velora APK in Google Colab

## Flow

1. On GitHub, download the repository as a ZIP.
2. Open colab/build_velora.ipynb in Google Colab.
3. Run the notebook cells from top to bottom.
4. Upload the GitHub ZIP when prompted.
5. The notebook installs JDK 17, Android command-line tools, SDK 35 and Gradle 8.9.
6. It automatically locates the Gradle project inside the ZIP.
7. It writes local.properties with the Colab Android SDK path.
8. It runs assembleDebug.
9. It copies the generated APK to /content/Velora-debug.apk.
10. The browser download begins automatically.

## Expected APK

app/build/outputs/apk/debug/app-debug.apk

The notebook exports the same file as:

Velora-debug.apk

## Installing

Copy the APK to the Android phone and install it. Android may require Allow from this source for the app used to open the APK.

After installation, open Android Home app settings and choose Velora as the default launcher.

## Optional permissions

Velora works as a launcher without notification or accessibility access.

Enable Notification Access only if you want notifications mirrored in the Velora Control Center.

Enable Velora navigation controls under Accessibility only if you want the custom Recents and global Back actions to invoke Android global navigation.
