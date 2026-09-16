/**
 * Composing text in `$EDITOR`, for the commands that offer it.
 *
 * `ergon edit` opens a Description; `ergon comment` opens a Comment, sometimes
 * from nothing. What they share is the decision of whether anything came back
 * worth writing, which is the part worth having in one place.
 */

/** A buffer to put in front of the operator. */
export interface BufferEdit {
  /** Names the buffer in the temp file and in the "unchanged" report. */
  subject: string;
  /** What the buffer starts as — empty for one written from scratch. */
  current: string;
  /** Thrown when neither `$VISUAL` nor `$EDITOR` is set. */
  missingEditor: string;
}

/**
 * Put `current` in front of the operator in `$EDITOR`. Returns undefined when
 * nothing should be written — the editor failed, or the buffer came back
 * exactly as it went in.
 *
 * There is no `vi` fallback: guessing an editor for someone who has not named
 * one strands them in whatever we guessed.
 */
export async function editInBuffer(
  edit: BufferEdit,
): Promise<string | undefined> {
  const editor = Deno.env.get("VISUAL") ?? Deno.env.get("EDITOR");

  if (!editor) {
    throw new Error(edit.missingEditor);
  }

  const path = await Deno.makeTempFile({
    prefix: `ergon-${edit.subject}-`,
    suffix: ".txt",
  });

  try {
    await Deno.writeTextFile(path, edit.current);

    const [command, ...args] = editor.split(/\s+/);
    const status = await new Deno.Command(command, {
      args: [...args, path],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }).output();

    if (!status.success) {
      throw new Error(
        `Editor exited with ${status.code}; ${edit.subject} unchanged.`,
      );
    }

    const edited = await Deno.readTextFile(path);

    return edited === edit.current ? undefined : edited;
  } finally {
    await Deno.remove(path).catch(() => {});
  }
}
