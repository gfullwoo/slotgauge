import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing comes from CI secrets (see .github/workflows/android.yml); without them only the debug APK is built.
val ksFile = rootProject.file("release.keystore")
val ksPass = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: ""
val keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "slotgauge"
val keyPass = System.getenv("ANDROID_KEY_PASSWORD") ?: ksPass

android {
    namespace = "com.slotgauge.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.slotgauge.app"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("ANDROID_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("ANDROID_VERSION_NAME") ?: "1.0"
        resValue("string", "host", "slotgauge.com")
    }

    signingConfigs {
        if (ksFile.exists() && ksPass.isNotEmpty()) {
            create("release") {
                storeFile = ksFile
                storePassword = ksPass
                this.keyAlias = keyAlias
                keyPassword = keyPass
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
