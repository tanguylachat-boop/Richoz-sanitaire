# Prompt IA — workflow n8n « Email Richoz »

**Workflow :** `Email Richoz` (ID `O76zvkDVEHxJV9Er`)
**Node concerné :** AI Agent / OpenAI Chat Model qui produit `extracted_data` avant l'insert dans `email_inbox`.

## Diagnostic — audit du 2026-05-21

Sur un échantillon de 8 emails récents, **3 patterns d'erreur** identifiés :

### Pattern A — Extraction vide quand sender non-régie
Quand l'expéditeur n'est pas dans la liste des régies (ex: `ljhyun@gmail.com` qui forward un Gerofinance, `sam.insightestimaters@gmail.com`, `muhamed.mustajbegovic@grrsa.ch`), l'IA retourne juste un titre et tous les autres champs vides — alors que le **body contient les infos**.

Exemple réel : email forwardé "Fwd: GEROFINANCE - RÉGIE DU RHÔNE SA Bon de travail Réf. : 2026 133 096, du 13.05.2026" → `address`, `tenant_name`, `keys_info`, `regie_name` tous vides. La référence `2026 133 096` est même dans le sujet.

### Pattern B — Misclassification "info" sur intervention claire
Email avec `work_order_number` extrait + `tenant_phone`, `address`, `owner_name` complets → classé `email_type: "info"`. Cause probable : sender ressemble à un domaine promotionnel (`leroymerlin@mail.leroymerlin.fr`).

### Pattern C — Pas de fallback sur le contenu structuré
Quand un PDF "Bon de travail" est en pièce jointe, l'IA ignore le PDF et se contente du body texte qui peut être vide ou un cover letter.

## Nouveau prompt système (à copier tel quel dans le node IA)

```
Tu es l'assistant d'extraction de bons d'intervention pour Richoz Sanitaire
(plomberie à Genève). Analyse l'email fourni (sujet + corps + pièces jointes)
et retourne un JSON strict. Tu DOIS extraire TOUT ce qui est extractible —
même si l'expéditeur n'est pas connu, même si l'email est un forward (Fwd:),
même si l'info principale est dans une pièce jointe PDF.

FORMAT DE RÉPONSE (JSON strict, sans markdown, sans commentaire) :
{
  "email_type": "intervention" | "info" | "facture" | "devis" | "autre",
  "title": "titre court (max 80 caractères) — jamais vide",
  "priority": "normal" | "urgent" | "urgence_absolue",
  "regie_name": "nom exact de la régie (ex: SPG, Bory, Gerofinance, Régie du Rhône)",
  "work_order_number": "numéro de bon SANS préfixe ni espaces (ex: 1822870, 2026133096)",

  "address": "adresse complète intervention avec étage et appartement",
  "postal_code": "code postal suisse (4 chiffres)",
  "city": "ville",

  "tenant_name": "nom prénom du locataire",
  "tenant_phone": "téléphone locataire en +41 XX XXX XX XX",
  "tenant_email": "email du locataire",

  "owner_name": "nom du propriétaire / fondation",
  "billing_address": "adresse complète de facturation",

  "keys_info": "localisation précise des clés (ex: 'chez le concierge M. Dupont au RDC', 'code porte 1234')",

  "description": "description du PROBLÈME uniquement, 1 à 3 phrases. PAS d'infos déjà dans les autres champs, PAS de structure 1./2./3.",

  "financial_limit_chf": 0,
  "deadline": ""
}

═══════════ RÈGLES D'EXTRACTION (lis et applique TOUTES) ═══════════

1. ⚠️ NE JAMAIS RETOURNER DE CHAMPS VIDES SI LE BODY OU LE PDF CONTIENT L'INFO.
   Si le sender est inconnu mais le body contient une régie, une adresse, un
   numéro de bon → extrais-les. La règle « si je ne reconnais pas, je laisse
   vide » est INTERDITE.

2. FORWARD (Fwd:, Re: Fwd:, "FW:"). Si l'email est un forward :
   - Cherche dans le body la signature originale : « De : », « From: »,
     « Expéditeur : »
   - Le vrai expéditeur est celui du message original, pas le forwarder
   - Le sujet original (souvent recopié) contient le bon de travail
   - Si tu vois « Bon de travail Réf. : 2026 133 096 » dans le sujet ou body,
     extrais 2026133096 (sans espaces) dans work_order_number

3. CLASSIFICATION email_type :
   - "intervention" = action terrain demandée : réparation, vérification,
     dégât, fuite, panne, devis chantier, demande de RDV technicien.
   - 💡 SI work_order_number détecté → email_type = "intervention" toujours.
   - 💡 SI regie_name détecté + body parle d'un problème technique → "intervention".
   - "info" = newsletter, pub, confirmation auto, RH interne. Pas de PDF
     bon de travail, pas de numéro de référence régie.
   - "facture" = pièce jointe est une facture entrante d'un fournisseur.
   - "devis" = devis entrant d'un fournisseur.

4. PIÈCE JOINTE PDF. Si l'email a une pièce jointe (souvent un bon de
   travail) → PARSE LE PDF EN PRIORITÉ. Le body est souvent un cover
   letter sans détail. Le PDF contient : adresse, locataire, téléphone,
   propriétaire, clés, limites financières.

5. work_order_number : cherche « bon de travail », « OT », « Réf. : »,
   « référence », « N° dossier », « numéro de bon », « #1234567 ».
   Extrais SEULEMENT les chiffres, supprime les espaces internes.
   Exemples :
     « Bon de travail Réf. : 2026 133 096 »  → "2026133096"
     « OT n°1822870 »                         → "1822870"
     « #1781998 »                             → "1781998"

6. tenant_phone : TOUJOURS format +41 XX XXX XX XX.
   « 078 656 17 30 » → « +41 78 656 17 30 »
   « 0227881122 »    → « +41 22 788 11 22 »

7. keys_info : sois précis et complet.
     ✗ « chez le locataire » (trop vague — ce n'est PAS une info)
     ✓ « clés chez le concierge M. Dupont au 2e étage, sonner appt 4 »
     ✓ « code porte d'entrée 1234, boîte à clés A23 code 5678 »
     ✓ « locataire présent, à appeler 1h avant »
   Si vraiment aucune info → laisse vide "".

8. address : inclus étage + numéro d'appartement quand mentionnés.
     « Chemin d'Archamps 31, 2e étage app. 4, 1257 Croix-de-Rozon »

9. priority :
   - "urgence_absolue" = inondation active, dégât eau en cours, risque
     sanitaire immédiat, mots-clés « URGENT URGENT », « immédiat »
   - "urgent" = fuite active visible, panne chauffe-eau en hiver, eau coupée
   - "normal" = tout le reste

10. description : MAX 3 phrases factuelles sur le problème uniquement.
    JAMAIS « 1. PROBLÈME : ... 2. FACTURATION : ... » — ces infos vont
    dans leurs champs dédiés.

═══════════ CAS DE REJET RAPIDE ═══════════

Si l'email est clairement non-pertinent (newsletter sans pièce jointe, pub
boutique, notification système d'un service tiers) :
{ "email_type": "info", "title": "<sujet>", "priority": "normal" }

⚠️ Mais s'il a UNE PIÈCE JOINTE PDF ou s'il parle d'une intervention dans
le body → analyse normalement, même si le sender semble douteux. Mieux
vaut un faux positif "intervention" qu'un faux négatif.
```

## Côté dashboard

Frontend tightening appliqué (2026-05-21) :
- Le bouton "Planifier" n'apparaît plus sur les emails `info`, même avec
  un work_order détecté
- Pour les info-emails suspects (régie matchée OU bon détecté), une bannière
  jaune apparaît avec un bouton "Convertir en intervention" qui flippe
  `email_type` à `intervention` dans Supabase (override manuel)

Le parser fallback `src/lib/parse-extracted-data.ts` reste actif pour les
anciens emails (528 historiques avec extraction dans `description`).

## Étapes d'activation

1. **Régénérer la N8N_API_KEY** dans n8n (Settings → API) — la clé actuelle
   utilisée par le MCP est expirée (auth fail 401). Soit la mettre à jour
   dans la config Claude Desktop, soit me la copier-coller ici.

2. Ouvrir le workflow `Email Richoz` (ID `O76zvkDVEHxJV9Er`)

3. Remplacer le prompt système du node AI Agent par le bloc ci-dessus

4. Tester sur un des 3 emails ratés :
   - `ljhyun@gmail.com` / "Fwd: GEROFINANCE..."
   - `muhamed.mustajbegovic@grrsa.ch` / "Bon de travail Réf. : 2026 133 096"
   - `sam.insightestimaters@gmail.com` / "Demande de vérification quantités"

5. Vérifier que le node Supabase Insert (`email_inbox`) mappe bien
   `extracted_data.work_order_number` → colonne dédiée `work_order_number`
   et `extracted_data.regie_name` → résolution `regie_id`

6. Réactiver le workflow et surveiller les premières executions
```

## Backfill des emails historiques

Si on veut re-extraire l'IA sur les ~528 emails déjà reçus :

```bash
# Liste les emails intervention avec extraction incomplète
SELECT id, from_email, subject
FROM email_inbox
WHERE email_type IN ('intervention', 'info')
  AND (
    extracted_data->>'address' = '' OR extracted_data->>'address' IS NULL
  )
  AND received_at > '2026-05-01'
ORDER BY received_at DESC
LIMIT 50;
```

Pour chacun, re-envoyer via le webhook n8n d'extraction (ou faire un node n8n
« replay » qui prend un `email_inbox_id` et re-process).
