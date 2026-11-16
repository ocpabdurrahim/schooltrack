package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The school's colours, the same ones web/src/styles.css uses.
 *
 * The app ran on the Material default until now, which is why it looked like a
 * sample: purple chrome on a green-branded school's receipts and ID cards. The
 * two clients sit side by side on a desk, so they share a palette.
 *
 * Light only, deliberately. The web app has no dark theme, every printed
 * artefact (receipt, admit card, ID card) is black on white, and a dark scheme
 * nobody has looked at is a worse bug than no dark scheme at all.
 */

internal val Green = Color(0xFF0A7D55)
internal val GreenDeep = Color(0xFF065F46)
internal val GreenDarkest = Color(0xFF07372A)
internal val GreenBright = Color(0xFF13A877)
internal val GreenSoft = Color(0xFFE7F4EE)
internal val Ink = Color(0xFF101828)
internal val InkSoft = Color(0xFF344054)
internal val Muted = Color(0xFF667085)
internal val Line = Color(0xFFE4E7EC)
internal val LineSoft = Color(0xFFF1F3F7)
internal val Canvas = Color(0xFFF4F6FA)
internal val Amber = Color(0xFFB45309)
internal val AmberSoft = Color(0xFFFFF4E5)
internal val Bad = Color(0xFFC0392B)
internal val BadSoft = Color(0xFFFDECEA)

private val SchoolTrackLight = lightColorScheme(
    primary = Green,
    onPrimary = Color.White,
    primaryContainer = GreenSoft,
    onPrimaryContainer = GreenDeep,
    secondary = InkSoft,
    onSecondary = Color.White,
    secondaryContainer = LineSoft,
    onSecondaryContainer = Ink,
    tertiary = Amber,
    onTertiary = Color.White,
    tertiaryContainer = AmberSoft,
    onTertiaryContainer = Amber,
    background = Canvas,
    onBackground = Ink,
    surface = Color.White,
    onSurface = Ink,
    surfaceVariant = LineSoft,
    onSurfaceVariant = Muted,
    // Material 3 takes a plain Card's colour from surfaceContainerLow, and
    // every role left unset keeps the BASELINE PURPLE. Leaving these out is
    // what put lilac cards on a green school's screens, so they are all set.
    surfaceBright = Color.White,
    surfaceDim = Color(0xFFE8ECF2),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFF8FAFC),
    surfaceContainerHigh = LineSoft,
    surfaceContainerHighest = LineSoft,
    inverseSurface = Ink,
    inverseOnSurface = Color.White,
    inversePrimary = GreenBright,
    scrim = Color(0x99101828),
    outline = Line,
    outlineVariant = Line,
    error = Bad,
    onError = Color.White,
    errorContainer = BadSoft,
    onErrorContainer = Bad,
)

@Composable
fun SchoolTrackTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = SchoolTrackLight, content = content)
}
