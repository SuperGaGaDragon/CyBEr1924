from pathlib import Path
import sys

# Allow running this file directly (`python path/to/run_example.py`) by adding project root.
if __package__ is None or __package__ == '':
    ROOT = Path(__file__).resolve().parent.parent
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

from multi_agent_platform.message_bus import MessageBus
from multi_agent_platform.run_flow import Orchestrator
from multi_agent_platform.session_store import ArtifactStore


if __name__ == '__main__':
    topic = '写一个梦幻的加缪风格中长篇小说（1-2w字）'
    artifact_store = ArtifactStore()
    message_bus = MessageBus(store=artifact_store)
    orch = Orchestrator(artifact_store=artifact_store, message_bus=message_bus)
    results = orch.run_all(topic)

    print(f"\nSession: {results['session_id']}")
    print('Done! Artifacts:')
    for label in ('plan', 'outline'):
        ref = results[label]
        print(f'{label}: {ref.path}')
