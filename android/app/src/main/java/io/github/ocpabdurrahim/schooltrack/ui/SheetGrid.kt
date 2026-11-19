package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * A grid you type into, the way a spreadsheet is — the Compose twin of the
 * web's SheetGrid.
 *
 * Not a column of forty cards, and not a box of text. The register the office
 * copies from is a grid and the file the list arrives in is a grid, so the
 * form is a grid: a row a student, a column a field, the headings staying put
 * at the top while the rows scroll under them.
 *
 * Three things make it a grid rather than a wall of boxes, and each is here
 * because without it the grid would be a worse paste box than the one it
 * replaced:
 *
 *   * PASTE A BLOCK and it lands from the cell it was dropped in, the form
 *     growing downwards to fit. Forty names pasted into a form showing eight
 *     rows is the normal case, not the awkward one. On a phone there is no
 *     paste event to catch, so a value that suddenly contains a tab or a
 *     newline IS a pasted block — nothing else can put one in a single-line
 *     box, because the keyboard's Enter moves on instead of typing.
 *   * RUN OUT OF ROWS and more appear, so nobody counts their list first.
 *   * NEXT goes across the row, which is the order a register is read out in,
 *     and the keyboard's own Next key already does it.
 *
 * It holds strings and knows nothing about students. What a column means is
 * the caller's business, and what the values mean is the list parser's.
 */
data class SheetColumn(
    val key: String,
    val label: String,
    /** Wide enough for what goes in it: a mobile number is not a box for three. */
    val width: Dp = 112.dp,
    val numeric: Boolean = false,
)

/** The row-number gutter, the same width in the headings and in every row. */
private val GUTTER = 30.dp

/** The × that takes a row out, the same width in the headings and in every row. */
private val REMOVE = 40.dp

/**
 * The headings, scrolling sideways in step with the rows.
 *
 * One ScrollState shared by this and every row is what keeps a heading over
 * its own column. Two states drift apart the moment anybody scrolls, and a
 * heading over the wrong column is worse than no heading at all.
 *
 * The gutter is OUTSIDE that scroll, here and in every row, so the row
 * numbers stay while the columns move. Scrolling right to correct row 12 and
 * no longer being able to see which row is 12 is the whole point of a number.
 */
@Composable
fun SheetHeadings(columns: List<SheetColumn>, scroll: ScrollState) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 4.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Spacer(Modifier.width(GUTTER))
        Row(Modifier.weight(1f).horizontalScroll(scroll), verticalAlignment = Alignment.Bottom) {
            columns.forEach { c ->
                Text(
                    c.label,
                    style = MaterialTheme.typography.labelMedium,
                    color = Muted,
                    maxLines = 1,
                    modifier = Modifier.width(c.width).padding(horizontal = 3.dp),
                )
            }
            Spacer(Modifier.width(REMOVE))
        }
    }
}

/** One row of the grid: its number, its cells, and the × that drops it. */
@Composable
fun SheetRow(
    number: Int,
    row: List<String>,
    columns: List<SheetColumn>,
    scroll: ScrollState,
    enabled: Boolean,
    onCell: (col: Int, value: String) -> Unit,
    onBlock: (col: Int, text: String) -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "$number",
            style = MaterialTheme.typography.bodySmall,
            color = Muted,
            maxLines = 1,
            modifier = Modifier.width(GUTTER),
        )
        Row(
            Modifier.weight(1f).horizontalScroll(scroll),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            columns.forEachIndexed { i, c ->
                BasicTextField(
                    value = row.getOrElse(i) { "" },
                    onValueChange = { v ->
                        if (v.contains('\t') || v.contains('\n')) onBlock(i, v) else onCell(i, v)
                    },
                    enabled = enabled,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium
                        .copy(color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(Green),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (c.numeric) KeyboardType.Number else KeyboardType.Text,
                        imeAction = ImeAction.Next,
                        capitalization = if (c.numeric) {
                            KeyboardCapitalization.None
                        } else {
                            KeyboardCapitalization.Words
                        },
                    ),
                    modifier = Modifier
                        .width(c.width)
                        .padding(horizontal = 3.dp)
                        .border(1.dp, Line, RoundedCornerShape(4.dp))
                        .background(Color.White, RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 9.dp),
                )
            }
            Box(Modifier.width(REMOVE), contentAlignment = Alignment.Center) {
                TextButton(
                    onClick = onRemove,
                    enabled = enabled,
                    contentPadding = PaddingValues(0.dp),
                    modifier = Modifier.size(36.dp),
                ) { Text("×", color = Muted, style = MaterialTheme.typography.titleMedium) }
            }
        }
    }
}

/** The help under the grid, the same words on both clients. */
@Composable
fun SheetGridHelp(modifier: Modifier = Modifier) {
    Text(
        "Type straight into the boxes, or paste a block out of Excel — it lands " +
            "from the box it is dropped in and the form grows to fit. Next moves " +
            "along the row, and a spare row appears as the last one is filled.",
        style = MaterialTheme.typography.bodySmall,
        color = Muted,
        modifier = modifier,
    )
}

/** A row of small actions over a grid, kept together so both screens agree. */
@Composable
fun SheetGridActions(
    onPaste: () -> Unit,
    onClear: () -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        TextButton(onClick = onPaste, enabled = enabled) { Text("Paste a block") }
        TextButton(onClick = onClear, enabled = enabled) { Text("Empty the form") }
    }
}
