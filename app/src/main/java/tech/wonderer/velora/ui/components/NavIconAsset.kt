package tech.wonderer.velora.ui.components

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil.compose.SubcomposeAsyncImage
import coil.compose.SubcomposeAsyncImageContent
import coil.compose.AsyncImagePainter

@Composable
fun NavIconAsset(
    uri: String?,
    modifier: Modifier = Modifier,
    fallback: @Composable () -> Unit,
) {
    if (uri.isNullOrBlank()) {
        fallback()
        return
    }

    SubcomposeAsyncImage(
        model = Uri.parse(uri),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier,
    ) {
        when (painter.state) {
            is AsyncImagePainter.State.Success -> SubcomposeAsyncImageContent()
            else -> fallback()
        }
    }
}
