import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { Card, CardBody, CardHeader } from '../../components/common/Card';
import { useAuth } from '../../context/AuthContext';
import { ApiError, apiClient } from '../../lib/apiClient';
import { UnauthorizedPage } from '../shared/UnauthorizedPage';

const inputClass = 'mt-1 block w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm';

type ComponentRow = Awaited<ReturnType<typeof apiClient.knowledgeGraph.list>>[number];
type RelationshipRow = Awaited<ReturnType<typeof apiClient.knowledgeGraph.relationships>>[number];
type RelationshipKind = RelationshipRow['relationship'];

const RELATIONSHIP_LABEL: Record<RelationshipKind, string> = {
  PREREQUISITE_OF: 'is a prerequisite of',
  PART_OF: 'is part of',
  RELATED_TO: 'is related to',
};

function message(err: unknown) {
  return err instanceof ApiError ? err.message : 'Could not save.';
}

export function KnowledgeComponentsPage() {
  const { currentUser } = useAuth();
  if (!currentUser || !['teacher', 'admin', 'principal'].includes(currentUser.role)) {
    return <UnauthorizedPage />;
  }
  return <Catalogue key={`${currentUser.id}:${currentUser.schoolId}`} />;
}

function Catalogue() {
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [subjectId, setSubjectId] = useState('');
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [relationships, setRelationships] = useState<RelationshipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [kind, setKind] = useState<RelationshipKind>('PREREQUISITE_OF');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient.assessments.targets()
      .then((classes) => {
        if (!active) return;
        const byId = new Map<string, string>();
        classes.forEach((section) => section.subjects.forEach((subject) => byId.set(subject.id, subject.name)));
        const rows = [...byId.entries()].map(([id, subjectName]) => ({ id, name: subjectName }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(rows);
        setSubjectId((current) => current || rows[0]?.id || '');
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(message(err));
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!subjectId) return;
    let active = true;
    setError('');
    Promise.all([
      apiClient.knowledgeGraph.list(subjectId),
      apiClient.knowledgeGraph.relationships(subjectId),
    ]).then(([concepts, links]) => {
      if (!active) return;
      setComponents(concepts);
      setRelationships(links);
      setSourceId((current) => concepts.some((item) => item.id === current) ? current : concepts[0]?.id || '');
      setTargetId((current) => concepts.some((item) => item.id === current) ? current : concepts[1]?.id || concepts[0]?.id || '');
    }).catch((err) => {
      if (active) setError(message(err));
    });
    return () => { active = false; };
  }, [subjectId, revision]);

  const names = new Map(components.map((item) => [item.id, item.name]));

  async function addConcept(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiClient.knowledgeGraph.create({
        name: name.trim(),
        description: description.trim(),
        subject_id: subjectId,
        topic: topic.trim(),
      });
      setName('');
      setDescription('');
      setRevision((value) => value + 1);
      setNotice('Concept saved. Evaluate a student scan on Upload to attach questions to it.');
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }

  async function addLink(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiClient.knowledgeGraph.link({ source_id: sourceId, target_id: targetId, relationship: kind });
      setRevision((value) => value + 1);
      setNotice('Link saved.');
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p role="status" className="text-sm">Loading subjects…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader
          title="Knowledge Components"
          subtitle="Add the concepts for a subject. Evaluation can attach a question only to a concept that already exists here."
        />
        <CardBody className="space-y-4">
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {notice && <p role="status" className="text-sm text-teal-800">{notice}</p>}
          {subjects.length === 0 ? (
            <p className="text-sm text-content-secondary">This school has no class subjects yet.</p>
          ) : (
            <label className="block text-sm font-medium text-navy-900">
              Subject
              <select id="kc-subject" className={inputClass} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>
          )}
          <p className="text-xs text-content-secondary">
            After the concepts exist, open <Link className="font-semibold text-teal-700 underline" to="/upload">Upload</Link>, leave the extracted text unchanged, and evaluate the scan. The student then sees the graph on their dashboard.
          </p>
        </CardBody>
      </Card>

      {subjectId && (
        <Card>
          <CardHeader title="Add a concept" subtitle="The same name and topic cannot be added twice for one subject." />
          <CardBody>
            <form onSubmit={addConcept} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-navy-900">
                Name
                <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} />
              </label>
              <label className="text-sm font-medium text-navy-900">
                Topic
                <input className={inputClass} value={topic} onChange={(event) => setTopic(event.target.value)} required maxLength={200} />
              </label>
              <label className="text-sm font-medium text-navy-900 sm:col-span-2">
                Description
                <textarea className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={3} />
              </label>
              <div>
                <Button type="submit" variant="teal" loading={saving} disabled={saving}>Add concept</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {components.length > 0 && (
        <Card>
          <CardHeader title="Concepts for this subject" />
          <CardBody>
            <ul className="space-y-2 text-sm">
              {components.map((item) => (
                <li key={item.id}>
                  <span className="font-medium text-navy-900">{item.name}</span>
                  <span className="text-content-secondary"> · {item.topic}</span>
                  {item.description && <p className="text-xs text-content-secondary">{item.description}</p>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {components.length >= 2 && (
        <Card>
          <CardHeader
            title="Link two concepts"
            subtitle="Prerequisite means the first concept comes before the second. A link cannot point at itself or form a cycle."
          />
          <CardBody>
            <form onSubmit={addLink} className="grid gap-4 sm:grid-cols-3">
              <label className="text-sm font-medium text-navy-900">
                From
                <select className={inputClass} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                  {components.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-navy-900">
                Relationship
                <select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as RelationshipKind)}>
                  <option value="PREREQUISITE_OF">is a prerequisite of</option>
                  <option value="PART_OF">is part of</option>
                  <option value="RELATED_TO">is related to</option>
                </select>
              </label>
              <label className="text-sm font-medium text-navy-900">
                To
                <select className={inputClass} value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                  {components.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-3">
                <Button type="submit" variant="outline" loading={saving} disabled={saving}>Link concepts</Button>
              </div>
            </form>
            {relationships.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm text-navy-900">
                {relationships.map((link) => (
                  <li key={link.id}>
                    {names.get(link.source_id) ?? link.source_id} {RELATIONSHIP_LABEL[link.relationship]} {names.get(link.target_id) ?? link.target_id}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
