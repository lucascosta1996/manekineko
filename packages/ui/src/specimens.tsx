"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, IconButton, LinkButton, Spinner, TextAction } from "./button";
import { Badge, Card, Disclosure, Feedback, Menu, Modal, Skeleton, Tabs, Tooltip } from "./components";
import { ConfirmProvider, useConfirm } from "./confirm";
import { Checkbox, Field, Input, Radio, Switch, Textarea } from "./forms";
import { PublicFooter } from "./footer";
import { Icon } from "./icons";
import { CompactSelect } from "./select";

function Specimens({ brand }: { brand?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [select, setSelect] = useState("sepolia");
  const [modal, setModal] = useState<"dialog" | "drawer" | null>(null);
  const [result, setResult] = useState("No action taken.");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  return <div className="ui-specimens">
    <header className="ui-specimen-header">{brand}<span>Component specimens</span><LinkButton href="#specimen-forms" variant="secondary">Jump to forms</LinkButton></header>
    <main>
      <h1 className="ui-type-page">Tincta component contracts</h1>
      <p className="ui-type-body">Deterministic production components. Actions stay within this local specimen.</p>
      <section aria-labelledby="specimen-type">
        <h2 className="ui-type-section" id="specimen-type">Typography</h2>
        <p className="ui-type-hero">A permanent collection identity</p>
        <p className="ui-type-marketing-section">Marketing section</p>
        <p className="ui-type-subheading">Subheading</p>
        <p className="ui-type-body">Body text retains its reading rhythm, including long explanations and transaction qualifications.</p>
        <p className="ui-type-label">Field label</p><p className="ui-type-caption">Supplemental caption</p>
      </section>
      <section aria-labelledby="specimen-buttons">
        <h2 className="ui-type-section" id="specimen-buttons">Buttons and actions</h2>
        <div className="ui-specimen-row">
          <Button data-testid="button-primary" icon={<Icon name="arrow" />}>Primary action</Button>
          <Button variant="secondary" data-testid="button-secondary">Secondary action</Button>
          <Button variant="ghost" data-testid="button-ghost">Ghost action</Button>
          <Button variant="destructive" data-testid="button-destructive">Delete draft</Button>
          <Button disabled data-testid="button-disabled">Unavailable</Button>
          <Button aria-pressed="true" variant="secondary">Selected action</Button>
          <IconButton aria-label="Refresh specimen" data-testid="button-icon"><Icon name="refresh" /></IconButton>
          <LinkButton href="#specimen-forms" variant="secondary" data-testid="button-link">Navigate to forms</LinkButton>
          <TextAction data-testid="text-action">Retry</TextAction>
          <Tooltip label="Read help"><Icon name="info" /></Tooltip>
        </div>
        <div className="ui-specimen-row">
          <Button data-testid="button-busy" busy={busy} busyLabel="Saving…" reserveLabels={["Save changes", "Saving…", "Changes saved"]}
            icon={<Icon name="check" />} onClick={() => { setBusy(true); setResult("Saving changes."); }}>Save changes</Button>
          <TextAction onClick={() => { setBusy(false); setResult("Changes saved."); }}>Finish simulated request</TextAction>
        </div>
        <p>Inline recovery <TextAction inline>read the explanation</TextAction> stays in the text flow.</p>
      </section>
      <section id="specimen-forms" aria-labelledby="specimen-forms-title">
        <h2 className="ui-type-section" id="specimen-forms-title">Forms</h2>
        <form className="ui-specimen-form" noValidate onSubmit={(event) => {
          event.preventDefault();
          if (!emailInput.current?.validity.valid) { setError("Enter a valid email address so we can keep your saved information associated with this account."); emailInput.current?.focus(); }
          else { setError(""); setResult("The local specimen form is valid. No information was sent."); }
        }}>
          <Field label="Email" required error={error} hint="Your entry remains after validation.">
            {(props) => <Input {...props} ref={emailInput} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />}
          </Field>
          <Field label="Description" hint="Long descriptions wrap without clipping.">{(props) => <Textarea {...props} defaultValue="A deterministic collection description." />}</Field>
          <Field label="Network">{(props) => <CompactSelect {...props} value={select} onChange={(event) => setSelect(event.target.value)}><option value="sepolia">Sepolia test network</option><option value="mainnet">Ethereum Mainnet</option><option value="unavailable" disabled>Unavailable network</option></CompactSelect>}</Field>
          <div className="ui-specimen-fields">
            <Field label="Opening time">{(props) => <Input {...props} type="datetime-local" defaultValue="2026-09-28T12:00" />}</Field>
            <Field label="Collection color">{(props) => <Input {...props} type="color" defaultValue="#7a8294" />}</Field>
            <Field label="Reference file">{(props) => <Input {...props} type="file" />}</Field>
          </div>
          <Checkbox label="I reviewed these terms" />
          <fieldset className="ui-specimen-fieldset"><legend>Display network</legend><Radio name="specimen-network" value="sepolia" label="Sepolia" defaultChecked /><Radio name="specimen-network" value="mainnet" label="Mainnet" /></fieldset>
          <Switch label="Show observation details" defaultChecked />
          <Button type="submit">Validate local form</Button>
        </form>
      </section>
      <section aria-labelledby="specimen-overlays">
        <h2 className="ui-type-section" id="specimen-overlays">Menus and overlays</h2>
        <div className="ui-specimen-row">
          <Menu label="Collection actions" items={[{ label: "View details", onSelect: () => setResult("Details selected.") }, { label: "Copy identifier", onSelect: () => setResult("Copy selected in fixture.") }, { label: "Unavailable action", disabled: true, onSelect: () => {} }]} />
          <Button variant="secondary" onClick={() => setModal("dialog")}>Open dialog</Button>
          <Button variant="secondary" onClick={() => setModal("drawer")}>Open drawer</Button>
          <Button variant="destructive" onClick={async () => setResult(await confirm({ title: "Delete local specimen?", description: "This confirmation exercises the shared cancellation and focus behavior. No saved draft or hosted data will change.", confirmLabel: "Delete specimen", destructive: true }) ? "Deletion confirmed in fixture." : "Deletion cancelled.")}>Open confirmation</Button>
        </div>
        <Modal open={modal !== null} onOpenChange={(open) => { if (!open) setModal(null); }} drawer={modal === "drawer"} title={modal === "drawer" ? "Specimen drawer" : "Specimen dialog"} description="Review the local state and close with Escape or the named close control.">
          <Field label="Dialog network">{(props) => <CompactSelect {...props} value={select} onChange={(event) => setSelect(event.target.value)}><option value="sepolia">Sepolia test network</option><option value="mainnet">Ethereum Mainnet</option></CompactSelect>}</Field>
          <p className="ui-type-body">The select popup remains usable within the dialog focus scope.</p>
          <div className="ui-dialog-actions"><Button variant="secondary" onClick={() => setModal(null)}>Close example</Button></div>
        </Modal>
      </section>
      <section aria-labelledby="specimen-content">
        <h2 className="ui-type-section" id="specimen-content">Content and feedback</h2>
        <Tabs label="Collection details" tabs={[{ id: "overview", label: "Overview", content: <p>Current terms stay visible beside their collection.</p> }, { id: "history", label: "History", content: <p>No previous observations.</p> }]} />
        <Disclosure title="How does this specimen work?"><p>These are the same shared components used by the application. The browser checks their real DOM, behavior and computed styles.</p></Disclosure>
        <Card><h3 className="ui-type-subheading">Collection summary</h3><p className="ui-type-body">Unknown values remain unknown until verified.</p><Badge tone="warning">Awaiting observation</Badge></Card>
        <div className="ui-table-scroll" tabIndex={0} role="region" aria-label="Specimen collection table"><table className="ui-table"><caption>Sample observations</caption><thead><tr><th scope="col">Collection</th><th scope="col">Status</th><th scope="col">Mint price</th></tr></thead><tbody><tr><th scope="row">Lunar Stone</th><td>Revealed fixture</td><td>0.01 ETH</td></tr></tbody></table></div>
        <Feedback tone="info">Awaiting a fresh collection observation.</Feedback>
        <Feedback tone="warning">Last-known data is informational while the connection recovers.</Feedback>
        <Feedback tone="danger">The request failed. Your entry has been retained. <TextAction>Retry request</TextAction></Feedback>
        <Feedback tone="success">The local form is saved in this specimen only.</Feedback>
        <div role="status" aria-live="polite" data-testid="specimen-result">{result}</div>
        <div role="status" aria-busy="true" aria-label="Loading collection details"><Skeleton /><span className="ui-specimen-row"><Spinner />Loading collection details…</span></div>
      </section>
    </main>
    <PublicFooter brand={brand} year={2026} links={{ website: "#specimen-type", app: "#specimen-buttons", docs: "#specimen-forms", contact: null, telegram: null, social: null }} legal="Local component verification specimen." />
  </div>;
}

function TabEntrySpecimen() {
  const tabs = [
    { id: "unavailable", label: "Unavailable", disabled: true, content: <p>Unavailable content.</p> },
    { id: "overview", label: "Overview", content: <p>Available overview.</p> },
    { id: "archived", label: "Archived", disabled: true, content: <p>Unavailable archive.</p> },
    { id: "history", label: "History", content: <p>Available history.</p> },
  ];
  return <main className="ui-specimens">
    <h1 className="ui-type-page">Tab keyboard entry fixtures</h1>
    <Button data-testid="button-short" aria-label="Short label target">I</Button>
    {[
      { label: "First disabled", defaultValue: undefined },
      { label: "Disabled default", defaultValue: "archived" },
      { label: "Enabled default", defaultValue: "history" },
    ].map(({ label, defaultValue }) => <section aria-label={label} key={label}>
      <Button>Before {label.toLowerCase()} tabs</Button>
      <Tabs label={label} tabs={tabs} defaultValue={defaultValue} />
    </section>)}
  </main>;
}

/** Only mount in explicitly enabled local/test fixtures, never a public production route. */
export function UISpecimens({ tabEntryFixture = false, ...props }: { brand?: ReactNode; tabEntryFixture?: boolean }) {
  return tabEntryFixture ? <TabEntrySpecimen /> : <ConfirmProvider><Specimens {...props} /></ConfirmProvider>;
}
