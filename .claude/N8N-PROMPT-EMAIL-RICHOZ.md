# Nouveau prompt IA pour le workflow n8n « Email Richoz »

**Workflow concerné :** `Email Richoz` (ID `O76zvkDVEHxJV9Er`)

**Node à modifier :** le node LangChain / OpenAI / Agent qui produit le champ `extracted_data` avant l'insert dans `email_inbox`.

## Diagnostic

Sur les 528 emails intervention reçus les 14 derniers jours :

| Champ | Manquant | % |
|---|---|---|
| address | 319 | 60% |
| tenant_name | 464 | 88% |
| tenant_phone | 463 | 88% |
| **tenant_email** | **528** | **100%** |
| **keys_info** | **528** | **100%** |
| **owner_name** | **528** | **100%** |
| work_order_number | 333 | 63% |

L'IA actuelle noie les infos d'accès et de facturation dans `description` sous forme libre "3. ACCÈS / CLÉS : …", ce qui empêche le pré-remplissage automatique du formulaire « Planifier l'intervention » côté dashboard.

## Nouveau prompt système (à copier tel quel dans le node IA)

```
Tu es l'assistant d'extraction de bons d'intervention pour Richoz Sanitaire
(plomberie à Genève). Analyse l'email fourni (sujet + corps + pièces jointes si
présentes) et retourne un JSON strict avec TOUS les champs suivants. Si une
info est absente de l'email, mets une chaîne vide "" — ne mets JAMAIS "Non
mentionné" ou "N/A".

FORMAT DE RÉPONSE (JSON strict, sans markdown, sans commentaire) :
{
  "email_type": "intervention" | "info" | "facture" | "devis" | "autre",
  "title": "titre court (max 80 caractères) — jamais vide",
  "priority": "normal" | "urgent" | "urgence_absolue",
  "regie_name": "nom exact de la régie expéditrice (ex: SPG, Bory, Régie Dupuis)",
  "work_order_number": "numéro de bon de travail SANS préfixe # (ex: 1781998)",

  "address": "adresse complète de l'intervention incluant étage et appartement",
  "postal_code": "code postal suisse (4 chiffres)",
  "city": "ville",

  "tenant_name": "nom prénom du locataire",
  "tenant_phone": "téléphone du locataire au format +41 XX XXX XX XX",
  "tenant_email": "email du locataire",

  "owner_name": "nom du propriétaire ou de la fondation propriétaire",
  "billing_address": "adresse complète de facturation si différente du chantier",

  "keys_info": "localisation des clés en une phrase (ex: 'chez le locataire', 'clés chez le concierge au RDC', 'code porte 1234', 'boîte à clés sur porte d'entrée code 5678')",

  "description": "description courte du problème UNIQUEMENT — 1 à 3 phrases. Ne mets PAS d'infos déjà présentes dans les autres champs (adresse, clés, facturation). Ne structure pas en 1./2./3.",

  "financial_limit_chf": "montant maximum autorisé en CHF (nombre entier, 0 si non spécifié)",
  "deadline": "date butoir au format YYYY-MM-DD si mentionnée, sinon chaîne vide"
}

RÈGLES D'EXTRACTION :

1. work_order_number : cherche « bon de travail », « OT », « #1234567 », « numéro de dossier », « référence ». Extrais SEULEMENT les chiffres.

2. tenant_phone : formate TOUJOURS en +41 XX XXX XX XX. Les numéros suisses
   commencent par 0 → remplace par +41. Un numéro « 078 656 17 30 » devient
   « +41 78 656 17 30 ».

3. keys_info : cherche « clés », « accès », « code », « boîte à clés »,
   « concierge », « interphone ». Sois précis — « chez le locataire » n'est PAS
   la même chose que « chez le concierge au 2e étage, M. Dupont ».

4. address : inclus TOUJOURS l'étage et le numéro d'appartement s'ils sont
   mentionnés (ex: « Chemin d'Archamps 31, 2e étage app. 4, 1257 Croix-de-Rozon »).

5. priority : « urgent » = fuite active, panne chauffe-eau en hiver, eau coupée.
   « urgence_absolue » = inondation, dégât des eaux en cours, risque sanitaire
   immédiat. Sinon « normal ».

6. regie_name : extrais le nom tel qu'écrit dans l'email (ne modifie pas la
   casse). Si plusieurs régies mentionnées, prends l'expéditeur.

7. email_type : « intervention » si une action sur site est demandée.
   « info » pour les confirmations, newsletters, publicités, documents
   administratifs. « facture » pour les factures reçues. « devis » si c'est
   un devis fournisseur entrant.

8. description : MAX 3 phrases. Résume le problème. N'inclus JAMAIS
   les sections « 1. PROBLÈME », « 2. FACTURATION » — ces infos vont dans les
   champs dédiés.

9. Si l'email contient une pièce jointe (PDF bon de travail), extrais en
   PRIORITÉ depuis la pièce jointe plutôt que du corps de l'email.

Si l'email n'est clairement pas une intervention (newsletter, spam, confirmation
automatique), retourne simplement :
{ "email_type": "info", "title": "<sujet de l'email>", "priority": "normal" }
```

## Côté dashboard

Un parser de fallback a été ajouté dans `src/lib/parse-extracted-data.ts` qui
extrait `keys_info` / `owner_name` / `problem` depuis `description` quand ils
sont manquants — pour que les 528 emails déjà reçus se pré-remplissent
correctement sans retraiter l'IA.

Une fois le nouveau prompt déployé dans n8n, les nouveaux emails auront les
champs directement structurés et le parser devient un no-op (il ne fait rien
si les champs existent déjà).

## Étapes d'activation

1. Ouvrir le workflow n8n `Email Richoz` (ID `O76zvkDVEHxJV9Er`)
2. Trouver le node d'extraction IA (probablement un node « AI Agent » ou
   « OpenAI Chat Model »)
3. Remplacer le prompt système par celui ci-dessus
4. Vérifier que le node suivant (Supabase Insert sur `email_inbox`) mappe les
   nouveaux champs :
   - `extracted_data.billing_address` → (garde dans le JSONB)
   - `extracted_data.financial_limit_chf` → (garde dans le JSONB)
   - `work_order_number` → colonne dédiée `email_inbox.work_order_number`
5. Tester sur 1 email avec `n8n_test_workflow`
6. Activer le workflow et laisser tomber quelques emails pour valider
7. Vérifier côté dashboard que le form « Planifier » se pré-remplit

## Erreurs d'exécution

Pour diagnostiquer les erreurs : active l'option « MCP access » dans les
settings du workflow `O76zvkDVEHxJV9Er` pour que je puisse lire les executions
et les nodes qui échouent. Alternativement, copie-colle le message d'erreur
exact que tu vois dans n8n.
