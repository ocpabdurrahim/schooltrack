package io.github.ocpabdurrahim.schooltrack.data

import com.google.android.gms.tasks.Task
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

const val SCHOOL_ID = "matkhola"

/**
 * Development only. With -PuseEmulators=true the app talks to the Firebase
 * emulators running on the developer's machine (10.0.2.2 is the host as seen
 * from an Android emulator), so a half-finished screen can never write to the
 * school's real records. Must be called before anything touches Firestore.
 */
object Emulators {
    private var wired = false

    fun wireIfRequested() {
        if (wired || !io.github.ocpabdurrahim.schooltrack.BuildConfig.USE_EMULATORS) return
        wired = true
        FirebaseAuth.getInstance().useEmulator("10.0.2.2", 9099)
        FirebaseFirestore.getInstance().useEmulator("10.0.2.2", 8080)
    }
}

/** Who the signed-in person is. Mirrors the web app's Access union. */
sealed interface Access {
    data object Loading : Access
    data object SignedOut : Access
    data class Staff(val role: String, val name: String, val email: String) : Access
    data class Guardian(val name: String, val email: String, val studentIds: List<String>) : Access
    data class None(val email: String) : Access
}

val Access.canMarkAttendance: Boolean
    get() = this is Access.Staff && (role == "ADMIN" || role == "TEACHER")

/** Minimal Task -> coroutine bridge, so no extra dependency is needed for it. */
suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont ->
    addOnSuccessListener { cont.resume(it) }
    addOnFailureListener { cont.resumeWithException(it) }
}

class AccessRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)

    /**
     * Resolves access the same way the rules do: staff first, then guardian,
     * then nobody.
     *
     * EACH LOOKUP IS TRIED SEPARATELY. A guardian is not permitted to read
     * `members` at all, and letting that refusal escape would end the chain
     * before the guardian lookup ran — every parent would be told they have no
     * access. In a rules-protected app a denial is often a normal answer.
     */
    suspend fun resolve(): Access {
        val user = auth.currentUser ?: return Access.SignedOut
        val email = user.email?.lowercase().orEmpty()
        if (email.isEmpty()) return Access.None("")

        suspend fun read(collection: String): DocumentSnapshot? = try {
            school().collection(collection).document(email).get().await()
        } catch (_: Exception) {
            null   // denied: this person is simply not that kind of user
        }

        read("members")?.takeIf { it.exists() }?.let { d ->
            val active = d.getBoolean("active") ?: false
            val deleted = d.getBoolean("deleted") ?: false
            if (active && !deleted) {
                return Access.Staff(
                    role = d.getString("role").orEmpty(),
                    name = d.getString("name") ?: email,
                    email = email,
                )
            }
        }

        read("guardians")?.takeIf { it.exists() }?.let { d ->
            if (d.getBoolean("active") == true) {
                @Suppress("UNCHECKED_CAST")
                val ids = (d.get("studentIds") as? List<String>).orEmpty()
                return Access.Guardian(d.getString("name") ?: email, email, ids)
            }
        }

        return Access.None(email)
    }

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim().lowercase(), password).await()
    }

    fun signOut() = auth.signOut()

    fun isSignedIn() = auth.currentUser != null
}
