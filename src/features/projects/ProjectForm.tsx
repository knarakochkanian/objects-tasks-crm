import { useState, type FormEvent } from 'react';
import { Button, ErrorNotice, Modal } from '../../components/UI';
import { api } from '../../lib/api';
import { useCrmMutation } from '../../lib/queries';
import type { Project, ProjectInput } from '../../lib/types';
import { validateProject } from '../../lib/workflow';

export function ProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: (project: Project) => void;
}) {
  const [original] = useState(project);
  const [input, setInput] = useState<ProjectInput>({
    name: project?.name ?? '',
    address: project?.address ?? '',
  });
  const [validation, setValidation] = useState<string | null>(null);
  const save = useCrmMutation((values: ProjectInput) => api.saveProject(values, original));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (save.isPending) return;
    const issue = validateProject(input);
    setValidation(issue);
    if (issue) return;
    try {
      onSaved(await save.mutateAsync(input));
    } catch {
      /* Mutation error is rendered below. */
    }
  }
  return (
    <Modal
      title={project ? 'Редактировать объект' : 'Новый объект'}
      onClose={onClose}
      busy={save.isPending}
    >
      <form onSubmit={submit}>
        <div className="modal-body form-stack">
          <label>
            Название объекта
            <input
              autoFocus
              name="name"
              value={input.name}
              maxLength={160}
              onChange={(event) => setInput({ ...input, name: event.target.value })}
              placeholder="Например, ЖК «Северный»"
              required
              disabled={save.isPending}
            />
          </label>
          <label>
            Адрес
            <input
              name="address"
              value={input.address}
              maxLength={300}
              onChange={(event) => setInput({ ...input, address: event.target.value })}
              placeholder="Город, улица, номер дома"
              required
              disabled={save.isPending}
            />
          </label>
          <ErrorNotice error={validation || save.error} />
        </div>
        <footer className="modal-footer">
          <Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" pending={save.isPending}>
            {project ? 'Сохранить изменения' : 'Создать объект'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
