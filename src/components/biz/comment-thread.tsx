import { Button, Label, TextArea, TextField } from "@heroui/react";
import type { Comment, Person } from "@/lib/pm/domain";
import { formatRelative } from "@/lib/pm/domain";
import { PersonAvatar } from "@/components/biz/person-avatar";

export function CommentThread({
  comments,
  people,
  draft,
  onDraft,
  onSubmit,
}: {
  comments: Comment[];
  people: Person[];
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-3">
      <ul className="flex flex-col gap-3">
        {comments.length === 0 ? <li className="type-caption">还没有评论。评论只留在讨论里，不会写进对象动态。</li> : null}
        {comments.map((comment) => {
          const author = people.find((person) => person.id === comment.authorId);
          return (
            <li key={comment.id} className="flex gap-2">
              <PersonAvatar person={author} />
              <div className="min-w-0">
                <div>
                  <span className="type-emphasis">{author?.name}</span>
                  <span className="type-caption ml-2">{formatRelative(comment.createdAt)}</span>
                </div>
                <p className="type-body mt-1">{comment.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <TextField value={draft} onChange={onDraft}>
          <Label className="sr-only">评论</Label>
          <TextArea rows={3} placeholder="写下评论，不会记入对象动态" />
        </TextField>
        <Button type="submit" size="sm" variant="primary" className="self-end" isDisabled={!draft.trim()}>
          发送评论
        </Button>
      </form>
    </div>
  );
}
