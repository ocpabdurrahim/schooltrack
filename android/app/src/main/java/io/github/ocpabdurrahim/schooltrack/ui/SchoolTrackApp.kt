package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import io.github.ocpabdurrahim.schooltrack.data.Access
import io.github.ocpabdurrahim.schooltrack.data.AccessRepository
import kotlinx.coroutines.launch

/**
 * Sign-in gate. The access record — not the account — decides what is shown,
 * exactly as on the web: signing in successfully grants nothing by itself.
 */
@Composable
fun SchoolTrackApp(repo: AccessRepository = remember { AccessRepository() }) {
    var access by remember { mutableStateOf<Access>(Access.Loading) }
    val scope = rememberCoroutineScope()

    suspend fun refresh() {
        access = if (repo.isSignedIn()) repo.resolve() else Access.SignedOut
    }

    LaunchedEffect(Unit) { refresh() }

    when (val current = access) {
        is Access.Loading -> LoadingScreen()
        is Access.SignedOut -> SignInScreen(
            onSignIn = { email, password ->
                repo.signIn(email, password)
                refresh()
            },
        )
        else -> HomeScreen(
            access = current,
            onSignOut = {
                repo.signOut()
                scope.launch { refresh() }
            },
        )
    }
}
