package com.masterorange.liuguang

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.masterorange.liuguang.data.DirectCollectionRepository
import com.masterorange.liuguang.data.KeystoreUserConfigurationStore
import com.masterorange.liuguang.ui.DirectAppViewModel
import com.masterorange.liuguang.ui.LiuGuangRoot
import com.masterorange.liuguang.ui.theme.LiuGuangTheme

class MainActivity : ComponentActivity() {
    private val viewModel: DirectAppViewModel by viewModels {
        DirectAppViewModel.Factory(
            DirectCollectionRepository(
                context = applicationContext,
                configurationStore = KeystoreUserConfigurationStore(applicationContext),
            ),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleShareIntent(intent)
        setContent {
            LiuGuangTheme {
                LiuGuangRoot(viewModel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShareIntent(intent)
    }

    private fun handleShareIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty()
        viewModel.acceptSharedText(text)
    }
}
