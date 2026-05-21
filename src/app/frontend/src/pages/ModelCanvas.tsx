import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactFlow, { Background, BackgroundVariant, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";
import {
  AlertTriangle,
  GitBranch,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { getProposal, type Proposal } from "../api/client";
import { buildGraph, nodeTypes } from "../compare/graph";
import { PageHeader } from "../ui/PageHeader";
import { Empty } from "../ui/Empty";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { StatusPill } from "../ui/StatusPill";
import { Button } from "../ui/Button";
import { LinkButton } from "../ui/LinkButton";
import { CopyChip } from "../ui/CopyChip";
import { useToast } from "../ui/Toast";

export default function ModelCanvas() {
  const [params] = useSearchParams();
  const proposalId = params.get("proposal_id");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchProposal = useCallback(() => {
    if (!proposalId) return;
    setLoading(true);
    setErrMsg(null);
    getProposal(proposalId)
      .then((p) => {
        setProposal(p);
        setErrMsg(null);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setErrMsg(msg);
        setProposal(null);
        toast({ tone: "danger", title: "Failed to load proposal", description: msg });
      })
      .finally(() => setLoading(false));
  }, [proposalId, toast]);

  useEffect(() => {
    fetchProposal();
  }, [fetchProposal]);

  // No proposal id at all
  if (!proposalId) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={<><GitBranch size={12} /> Model</>}
          title="Model Canvas"
          description="Visualize a proposal as a star schema with facts, dimensions, and joins."
        />
        <Card>
          <Empty
            icon={<GitBranch aria-hidden size={22} />}
            title="No proposal selected"
            description="Pick a proposal from Approvals, or start a new one from Chat."
            action={
              <div style={{ display: "flex", gap: 8 }}>
                <LinkButton to="/approvals" leadingIcon={<ShieldCheck aria-hidden />}>
                  Open Approvals
                </LinkButton>
                <LinkButton
                  to="/chat"
                  variant="primary"
                  leadingIcon={<MessageSquare aria-hidden />}
                >
                  Start a chat
                </LinkButton>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  // Fetch failed
  if (!loading && errMsg && !proposal) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={<><GitBranch size={12} /> Model</>}
          title="Model Canvas"
        />
        <Card>
          <Empty
            icon={<AlertTriangle aria-hidden size={22} />}
            title="Couldn't load this proposal"
            description={errMsg}
            action={
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={fetchProposal} leadingIcon={<RefreshCw aria-hidden />}>
                  Retry
                </Button>
                <LinkButton to="/approvals" variant="ghost">
                  Back to Approvals
                </LinkButton>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  // Loading
  if (loading || !proposal) {
    return (
      <div className="page page-fullheight">
        <Skeleton shape="line" width="40%" height={28} />
        <Skeleton shape="block" height={480} />
      </div>
    );
  }

  const { nodes, edges } = buildGraph({ proposal });
  const ns = proposal.model.catalog && proposal.model.schema
    ? `${proposal.model.catalog}.${proposal.model.schema}`
    : "—";
  const empty = nodes.length === 0;

  return (
    <div className="page page-fullheight canvas-page">
      <PageHeader
        eyebrow={<><GitBranch size={12} /> Proposal</>}
        title={
          <>
            <span style={{ fontFamily: "var(--font-mono)" }}>{ns}</span>
            <StatusPill status={proposal.status} />
          </>
        }
        description={
          <>
            Version {proposal.version} · by {proposal.created_by}
          </>
        }
        actions={
          <>
            <CopyChip value={proposal.id} display={proposal.id.slice(0, 8)} title="Copy proposal id" />
            <LinkButton
              to={`/chat?proposal_id=${proposal.id}`}
              variant="ghost"
              leadingIcon={<MessageSquare aria-hidden />}
            >
              Refine in chat
            </LinkButton>
            <LinkButton
              to="/approvals"
              variant="primary"
              leadingIcon={<ShieldCheck aria-hidden />}
            >
              Approvals
            </LinkButton>
          </>
        }
      />

      <div className="canvas-wrap">
        {empty ? (
          <Empty
            icon={<GitBranch aria-hidden size={22} />}
            title="This proposal has no facts or dimensions yet"
            description="Open it in chat and ask the agent to design a model."
            action={
              <LinkButton
                to={`/chat?proposal_id=${proposal.id}`}
                variant="primary"
                leadingIcon={<MessageSquare aria-hidden />}
              >
                Open in chat
              </LinkButton>
            }
          />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#dadde2" />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(15,23,42,0.06)"
              nodeColor={(n) => {
                if (n.type === "fact") return "#fef3c7";
                const reused = (n.data as { dim?: { reused_from_seed?: boolean } }).dim?.reused_from_seed;
                return reused ? "#d1fae5" : "#dbeafe";
              }}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
