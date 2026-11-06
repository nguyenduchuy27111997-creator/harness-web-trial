import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { NoteForm } from "@/components/note-form";
import { Card, CardContent } from "@/components/ui/card";
import { formatNoteDate, type Note, type NoteFormState } from "@/lib/notes";

type Props = {
  notes: Note[];
  action: (prev: NoteFormState, formData: FormData) => Promise<NoteFormState>;
  deleteAction: (noteId: string, formData: FormData) => Promise<void>;
};

export function BookNotes({ notes, action, deleteAction }: Props) {
  return (
    <section aria-labelledby="notes-heading" className="flex flex-col gap-3">
      <h2 id="notes-heading" className="font-heading text-xl font-semibold">
        Notes
      </h2>
      <NoteForm action={action} />
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">This book has no notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id}>
              <Card>
                <CardContent className="flex flex-col gap-1 break-words">
                  <p className="whitespace-pre-wrap text-base">{note.body}</p>
                  <p className="text-sm text-muted-foreground">{formatNoteDate(note.created_at)}</p>
                  <ConfirmDeleteButton
                    heading="Delete this note?"
                    description="This note will be deleted. This cannot be undone."
                    size="sm"
                    action={deleteAction.bind(null, note.id)}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
