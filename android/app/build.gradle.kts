import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
    alias(libs.plugins.ksp)
}

/**
 * Release signing.
 *
 * The keystore and its passwords live in android/keystore.properties, which is
 * gitignored along with *.jks: THIS REPO IS PUBLIC, and a signing key in it
 * would let anyone publish an update that phones accept as ours. Without that
 * file the release build is simply unsigned, so a fresh clone still builds.
 */
val signing = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "io.github.ocpabdurrahim.schooltrack"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.ocpabdurrahim.schooltrack"
        minSdk = 24
        targetSdk = 35
        versionCode = (project.findProperty("versionCodeOverride") as String?)?.toInt() ?: 53
        versionName = (project.findProperty("versionNameOverride") as String?) ?: "1.5.2"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // ./gradlew assembleDebug -PuseEmulators=true  points the app at the
        // Firebase emulators on the host (10.0.2.2 from an Android emulator),
        // so development never touches the school's real data.
        buildConfigField(
            "boolean",
            "USE_EMULATORS",
            (project.findProperty("useEmulators") as String? ?: "false"),
        )

        // 10.0.2.2 is the host as seen from an ANDROID EMULATOR and means
        // nothing on a real phone. To test on a handset, pass this machine's
        // LAN address:  -PuseEmulators=true -PemulatorHost=192.168.0.12
        buildConfigField(
            "String",
            "EMULATOR_HOST",
            "\"" + (project.findProperty("emulatorHost") as String? ?: "10.0.2.2") + "\"",
        )

        // Where the app asks whether there is a newer version of itself.
        // GitHub's own API, no key and no account: the releases of a public
        // repository are public, which is the whole reason this works at a
        // school with no Play Store listing and no device management.
        buildConfigField(
            "String",
            "UPDATE_API_URL",
            "\"" + (
                project.findProperty("updateApiUrl") as String?
                    ?: "https://api.github.com/repos/ocpabdurrahim/schooltrack/releases/latest"
                ) + "\"",
        )
    }

    signingConfigs {
        if (signing.containsKey("storeFile")) {
            create("release") {
                storeFile = rootProject.file(signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // R8 stays off on purpose: Firestore, ML Kit and CameraX all need
            // keep rules, and a school finding out at the gate that the scanner
            // was stripped is not worth the few megabytes.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // java.time is used throughout (working days, month arithmetic) and is
        // API 26+ without this. minSdk is 24.
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}

dependencies {
    coreLibraryDesugaring(libs.desugar.jdk.libs)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    // knowing whether the app is in front, so an update never lands mid-task
    implementation(libs.androidx.lifecycle.process)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // same project, same rules as the web app
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)

    // gate scanning
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.mlkit.barcode.scanning)
    implementation(libs.zxing.core)

    // student photos: EXIF, so a portrait taken on a phone is not stored lying down
    implementation(libs.androidx.exifinterface)

    // the offline queue: a scan at the gate must survive no signal
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.zxing.core)
    // The real org.json on the unit-test classpath. Android ships a STUB whose
    // every method throws "not mocked", so a parser written against the
    // platform's JSON cannot be tested at all without this.
    testImplementation("org.json:json:20231013")
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
