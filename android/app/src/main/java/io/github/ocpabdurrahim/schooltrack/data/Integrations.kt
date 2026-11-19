package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions

/**
 * The school's Gemini key, and which model it is spent on.
 *
 * NOT under settings/. That collection is readable by guardians -- parents
 * reading their own child's results -- and Firestore rules are a union, so a
 * narrower rule on one document inside it cannot take that back. The key
 * therefore lives in a collection of its own that only the people who enter
 * marks can read at all.
 *
 * The key is never in this repository, which is public. It is pasted in once
 * on the Setup screen and kept here.
 *
 * The twin of web/src/data/integrations.ts.
 */

data class Integrations(
    /** Empty until somebody pastes one in. */
    val geminiApiKey: String = "",
    /**
     * Discovered from the account rather than chosen here, and written back so
     * the discovery happens once rather than before every sheet.
     */
    val geminiModel: String = "",
    /**
     * The runners-up, best first, so a busy model is something to step around
     * rather than wait out. Empty on a key saved before this existed, which is
     * why geminiModel is still kept and still used first.
     */
    val geminiModels: List<String> = emptyList(),
)

/**
 * A key as it is safe to show on screen: the last four characters.
 *
 * Enough for somebody to tell whether the key they are looking at is the one
 * they meant to paste, and useless to anybody reading over their shoulder.
 */
fun maskKey(key: String): String {
    val k = key.trim()
    return when {
        k.isEmpty() -> ""
        k.length <= 4 -> "••••"
        else -> "••••••••" + k.takeLast(4)
    }
}

class IntegrationsRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun ref() =
        db.collection("schools").document(SCHOOL_ID)
            .collection("integrations").document("gemini")

    /**
     * What is stored, or nothing.
     *
     * A refusal is an answer here, not a fault: ACCOUNTS and OFFICE staff have
     * no business with this key and the rules say so, and the screens that
     * call this cope with an empty answer by telling the person to ask an
     * admin.
     */
    suspend fun get(): Integrations = try {
        val snap = ref().get().await()
        Integrations(
            geminiApiKey = snap.getString("geminiApiKey").orEmpty(),
            geminiModel = snap.getString("geminiModel").orEmpty(),
            geminiModels = (snap.get("geminiModels") as? List<*>)
                ?.mapNotNull { it as? String }.orEmpty(),
        )
    } catch (_: Exception) {
        Integrations()
    }

    /** Only the fields given are touched, so remembering a model cannot wipe a key. */
    suspend fun save(
        apiKey: String? = null,
        model: String? = null,
        models: List<String>? = null,
    ) {
        val data = mutableMapOf<String, Any>("updatedAt" to FieldValue.serverTimestamp())
        apiKey?.let { data["geminiApiKey"] = it.trim() }
        model?.let { data["geminiModel"] = it.trim() }
        models?.let { list -> data["geminiModels"] = list.map { it.trim() } }
        ref().set(data, SetOptions.merge()).await()
    }
}
