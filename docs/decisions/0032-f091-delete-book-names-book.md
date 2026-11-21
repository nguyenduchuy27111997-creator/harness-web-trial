# 0032: F091 Delete book names the book

F091's acceptance says Delete "asks to confirm, naming the book". On the book page the trigger becomes a red "Delete book" (`variant="destructive"`) and the dialog heading becomes "Delete <title>?" (it was "Delete this book?"). This replaces decision 0008's "the book dialog's text and look are unchanged" for the book page only; `ConfirmDeleteButton`'s other callers (notes, quotes, past reads, shelves) keep their text and look through the new optional props `triggerLabel` and `triggerVariant`.
