"""Run B needs the two document ids run A dumped from the library (the bridge matches testIDs exactly)."""
import json, sys
txt, pdf = sys.argv[1], sys.argv[2]
def new_chat():
    return [{"op":"deeplink","url":"/chats"},{"op":"waitFor","testID":"new-chat","timeoutMs":15000},{"op":"press","testID":"new-chat"},
            {"op":"waitFor","testID":"start-chat","timeoutMs":10000},{"op":"press","testID":"start-chat"},{"op":"waitFor","testID":"composer-input","timeoutMs":30000},{"op":"sleep","ms":1500}]
def answer_done(ms=300000):
    return [{"op":"waitFor","testID":"assistant-text","timeoutMs":240000},{"op":"sleep","ms":1000},{"op":"waitFor","testID":"stop","gone":True,"timeoutMs":ms},{"op":"sleep","ms":1500}]
b = {"_": "Pass 20, run B (same app process as run A): Documents -> Ask off-topic then on-topic (round 108); the loop-guard row again with round 97's own wording; Settings -> Privacy & storage; the vault's Extensions section with e5 installed, then after Remove (downloadable).",
"steps": [
 {"op":"deeplink","url":"/documents"},{"op":"waitFor","testID":"documents-screen","timeoutMs":15000},{"op":"sleep","ms":1500},
 {"op":"press","testID":f"doc-select-{txt}"},{"op":"press","testID":f"doc-select-{pdf}"},{"op":"sleep","ms":800},
 {"op":"screenshot","name":"Q01-docs-selected"},
 {"op":"press","testID":"documents-ask-selected"},{"op":"waitFor","testID":"ask-sheet","timeoutMs":10000},{"op":"sleep","ms":1000},
 {"op":"value","testID":"ask-strict"},
 {"op":"type","testID":"ask-input","text":"Who won the 1998 football World Cup?"},{"op":"press","testID":"ask-send"},
 {"op":"waitFor","testID":"ask-answer","timeoutMs":240000},{"op":"sleep","ms":1000},{"op":"waitFor","testID":"ask-stop","gone":True,"timeoutMs":240000},{"op":"sleep","ms":1500},
 {"op":"waitFor","testID":"ask-none-matched","timeoutMs":5000},
 {"op":"screenshot","name":"Q02-ask-offtopic-notice"},
 {"op":"value","testID":"ask-answer"},{"op":"value","testID":"ask-none-matched"},{"op":"value","testID":"ask-stats"},
 {"op":"waitFor","testID":"citations","gone":True,"timeoutMs":1000},
 {"op":"type","testID":"ask-input","text":"What is the Rakovsky turbine serial number?"},{"op":"press","testID":"ask-send"},
 {"op":"sleep","ms":2000},{"op":"waitFor","testID":"ask-stop","gone":True,"timeoutMs":240000},{"op":"sleep","ms":1500},
 {"op":"screenshot","name":"Q03-ask-ontopic-sources"},
 {"op":"value","testID":"ask-answer"},{"op":"value","testID":"citations"},
 {"op":"waitFor","testID":"ask-none-matched","gone":True,"timeoutMs":1000},

 *new_chat(),
 {"op":"type","testID":"composer-input","text":"Repeat exactly this sentence five times, each on its own line: The quick brown fox jumps over the lazy dog."},{"op":"send"},
 *answer_done(),
 {"op":"screenshot","name":"L02-repeat-five-r97-wording"},
 {"op":"value","testID":"assistant-text"},
 {"op":"waitFor","testID":"loop-notice","gone":True,"timeoutMs":1000},
 *new_chat(),
 {"op":"type","testID":"composer-input","text":"Repeat this sentence 5 times, each on its own line: The quick brown fox jumps over the lazy dog."},{"op":"send"},
 *answer_done(),
 {"op":"screenshot","name":"L03-repeat-5-second-try"},
 {"op":"value","testID":"assistant-text"},
 {"op":"waitFor","testID":"loop-notice","gone":True,"timeoutMs":1000},

 {"op":"deeplink","url":"/settings"},{"op":"waitFor","testID":"row-storage","timeoutMs":10000},{"op":"sleep","ms":1000},
 {"op":"press","testID":"row-storage"},{"op":"waitFor","testID":"storage","timeoutMs":10000},{"op":"sleep","ms":2500},
 {"op":"screenshot","name":"G01-privacy-storage"},
 {"op":"value","testID":"storage-chats"},{"op":"value","testID":"storage-documents"},{"op":"value","testID":"storage-models"},{"op":"value","testID":"storage-backup"},
 {"op":"dump","name":"storage"},

 {"op":"deeplink","url":"/vault"},{"op":"sleep","ms":3000},
 {"op":"value","testID":"vault-storage"},
 {"op":"scrollTo","testID":"model-card-vision-qwen35"},{"op":"sleep","ms":1000},
 {"op":"screenshot","name":"X02-vault-extensions-vision"},
 {"op":"assertText","text":"Extensions"},
 {"op":"value","testID":"model-card-vision-qwen35"},
 {"op":"scrollTo","testID":"model-card-embed-e5"},{"op":"sleep","ms":1000},
 {"op":"screenshot","name":"X03-vault-extensions-e5-installed"},
 {"op":"value","testID":"model-card-embed-e5"},
 {"op":"dump","name":"vault-installed"},
 {"op":"press","testID":"remove-embed-e5"},{"op":"sleep","ms":2500},
 {"op":"scrollTo","testID":"model-card-embed-e5"},{"op":"sleep","ms":1000},
 {"op":"screenshot","name":"X04-vault-extensions-e5-downloadable"},
 {"op":"value","testID":"model-card-embed-e5"},
 {"op":"waitFor","testID":"install-embed-e5","timeoutMs":5000},
 {"op":"value","testID":"model-card-vision-qwen35"},
 {"op":"dump","name":"vault-after-remove"}
]}
json.dump(b, open("b-docs-loop-storage-vault.json","w"), indent=0)
print(len(b["steps"]), "steps")
