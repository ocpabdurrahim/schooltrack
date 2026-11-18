package io.github.ocpabdurrahim.schooltrack.data

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlin.math.PI
import kotlin.math.sin

/**
 * Playing the gate sounds on a phone.
 *
 * The notes are rendered to PCM here rather than shipped as .wav files: two
 * sounds of a quarter of a second each are a few lines of arithmetic, and an
 * asset would be one more thing to keep in step with the web, which
 * synthesises its own.
 *
 * USAGE is the alarm stream, not the media stream. A gate scanner that falls
 * silent because somebody muted the music is a scanner that stops being
 * trusted — the whole point of the sound is that nobody is looking.
 */

private const val SAMPLE_RATE = 44100

/** A sound as 16-bit mono PCM. */
internal fun render(notes: List<Note>): ShortArray {
    val ms = totalMs(notes) + 40
    val frames = SAMPLE_RATE * ms / 1000
    val mix = DoubleArray(frames)

    for (n in notes) {
        val start = SAMPLE_RATE * n.at / 1000
        val length = SAMPLE_RATE * n.ms / 1000
        // A square wave for the low buzz and a sine for the bell: the
        // harmonics are what make a buzz sound WRONG rather than merely low.
        val square = n.freq < 500
        for (i in 0 until length) {
            val at = start + i
            if (at >= frames) break
            val phase = 2.0 * PI * n.freq * i / SAMPLE_RATE
            val wave = if (square) (if (sin(phase) >= 0) 0.6 else -0.6) else sin(phase)
            mix[at] += wave * n.gain * envelope(i * 1000.0 / SAMPLE_RATE, n.ms)
        }
    }

    return ShortArray(frames) { i ->
        // clamped, because two overlapping notes can add to more than one
        val v = mix[i].coerceIn(-1.0, 1.0)
        (v * Short.MAX_VALUE).toInt().toShort()
    }
}

private fun play(pcm: ShortArray) {
    try {
        val bytes = pcm.size * 2
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(bytes)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()

        track.write(pcm, 0, pcm.size)
        // Released when it finishes rather than left to the collector: a
        // morning of scanning would otherwise hold a few hundred tracks.
        track.setNotificationMarkerPosition(pcm.size)
        track.setPlaybackPositionUpdateListener(
            object : AudioTrack.OnPlaybackPositionUpdateListener {
                override fun onMarkerReached(t: AudioTrack?) { runCatching { t?.release() } }
                override fun onPeriodicNotification(t: AudioTrack?) {}
            },
        )
        track.play()
    } catch (_: Exception) {
        // no audio on this device: the colour and the message still show
    }
}

/** Rendered once and kept: the same two sounds all morning. */
private val successPcm by lazy { render(SUCCESS_CHIME) }
private val errorPcm by lazy { render(ERROR_BUZZ) }

fun playSuccess() = play(successPcm)
fun playError() = play(errorPcm)

// ---------------------------------------------------------------------------
// whether to make a noise at all

private const val PREFS = "schooltrack"
private const val KEY = "gate.sound"

/** On unless this device has been told otherwise. A scanner nobody can hear
 *  is worse than useless, so silence has to be chosen deliberately. */
fun soundOn(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY, true)

fun setSoundOn(context: Context, on: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY, on).apply()
}
