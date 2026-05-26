#!/bin/bash
set -e

OPENAI_KEY="$1"

if [ -z "$OPENAI_KEY" ]; then
  echo "Usage: ./setup.sh YOUR_OPENAI_API_KEY"
  exit 1
fi

echo ""
echo "=== Verified Height — Setup ==="
echo ""

# Check Supabase CLI login
if ! supabase projects list &>/dev/null; then
  echo "You need to log in to Supabase first."
  echo "Run: supabase login"
  echo "Then re-run this script."
  exit 1
fi

echo "✓ Supabase CLI authenticated"

# Get org ID (use first org)
ORG_ID=$(supabase orgs list --output json 2>/dev/null | python3 -c "
import sys, json
orgs = json.load(sys.stdin)
if not orgs:
    print('ERROR')
else:
    print(orgs[0]['id'])
")

if [ "$ORG_ID" = "ERROR" ] || [ -z "$ORG_ID" ]; then
  echo "Could not find a Supabase organization. Please create one at supabase.com."
  exit 1
fi

echo "✓ Using org: $ORG_ID"

# Generate DB password
DB_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 20)

# Create project
echo "Creating Supabase project..."
PROJECT_JSON=$(supabase projects create height-verification \
  --org-id "$ORG_ID" \
  --db-password "$DB_PASS" \
  --region us-east-1 \
  --output json 2>/dev/null)

PROJECT_ID=$(echo "$PROJECT_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
PROJECT_URL="https://${PROJECT_ID}.supabase.co"

echo "✓ Project created: $PROJECT_ID"
echo "  Waiting for project to initialize (30s)..."
sleep 30

# Link project
supabase link --project-ref "$PROJECT_ID" 2>/dev/null || true

# Push schema via Supabase CLI db push
echo "Applying database schema..."
supabase db push --project-ref "$PROJECT_ID" 2>/dev/null || \
  PGPASSWORD="$DB_PASS" psql "postgresql://postgres@db.${PROJECT_ID}.supabase.co:5432/postgres" \
    -f supabase/migrations/20240101000000_init.sql 2>/dev/null || \
  echo "  (Schema will need to be applied manually — see supabase/migrations/20240101000000_init.sql)"

# Get API keys
echo "Fetching API keys..."
KEYS_JSON=$(supabase projects api-keys --project-ref "$PROJECT_ID" --output json 2>/dev/null)
ANON_KEY=$(echo "$KEYS_JSON" | python3 -c "
import sys, json
keys = json.load(sys.stdin)
for k in keys:
    if k.get('name') == 'anon':
        print(k['api_key'])
        break
")

if [ -z "$ANON_KEY" ]; then
  echo ""
  echo "⚠️  Could not auto-fetch API keys. Get them from:"
  echo "   https://supabase.com/dashboard/project/${PROJECT_ID}/settings/api"
  echo ""
  echo "Then create .env.local manually:"
  echo "   NEXT_PUBLIC_SUPABASE_URL=${PROJECT_URL}"
  echo "   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>"
  echo "   OPENAI_API_KEY=${OPENAI_KEY}"
else
  # Write .env.local
  cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${PROJECT_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
OPENAI_API_KEY=${OPENAI_KEY}
EOF
  echo "✓ .env.local written"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. If schema was not applied automatically, run the SQL in supabase/schema.sql"
echo "     in your Supabase dashboard: https://supabase.com/dashboard/project/${PROJECT_ID}/sql"
echo "  2. Start the dev server: npm run dev"
echo "  3. Open http://localhost:3000"
echo ""
