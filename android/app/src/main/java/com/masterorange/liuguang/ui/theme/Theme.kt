package com.masterorange.liuguang.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF4484F4),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD9E6FF),
    onPrimaryContainer = Color(0xFF001B3E),
    secondary = Color(0xFF56647A),
    background = Color(0xFFF2F2F7),
    surface = Color.White,
    surfaceVariant = Color(0xFFE5E5EA),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF8BB6FF),
    onPrimary = Color(0xFF002E69),
    primaryContainer = Color(0xFF16477F),
    onPrimaryContainer = Color(0xFFD9E6FF),
    secondary = Color(0xFFBEC7DA),
    background = Color(0xFF000000),
    surface = Color(0xFF1C1C1E),
    surfaceVariant = Color(0xFF2C2C2E),
)

@Composable
fun LiuGuangTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
