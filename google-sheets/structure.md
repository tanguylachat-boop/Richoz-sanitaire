# Structure Google Sheets

## Configuration

- **Nom du fichier:** ICS_V1_Data
- **ID:** A remplacer dans les workflows par votre ID

---

## Onglet: `regies`

Contient la liste des regies immobilieres.

| Colonne | Type | Description |
|---------|------|-------------|
| keyword | string | Mot-cle pour identifier la regie (ex: FONCIA) |
| regie_name | string | Nom complet de la regie |
| regie_email | string | Email de contact de la regie |

### Donnees initiales

```
keyword     | regie_name        | regie_email
FONCIA      | Foncia Geneve     | geneve@foncia.com
NAEF        | Naef Immobilier   | contact@naef.ch
SIPA        | SIPA SA           | service@sipa.ch
```

---

## Onglet: `regie_inbox`

Stocke les emails recus des regies.

| Colonne | Type | Description |
|---------|------|-------------|
| received_at | datetime | Date/heure de reception (ISO 8601) |
| from_email | string | Email de l'expediteur |
| subject | string | Sujet de l'email |
| raw_text | string | Contenu texte de l'email |
| regie_name | string | Nom de la regie identifiee |
| status | string | Statut: NEW, PROCESSED, ARCHIVED |

---

## Onglet: `interventions`

Stocke les interventions depuis Google Calendar.

| Colonne | Type | Description |
|---------|------|-------------|
| event_id | string | ID unique de l'evenement Calendar |
| created_at | datetime | Date de creation (ISO 8601) |
| start_datetime | datetime | Debut de l'intervention |
| end_datetime | datetime | Fin de l'intervention |
| title | string | Titre de l'evenement |
| address | string | Adresse de l'intervention |
| technician_name | string | Nom du technicien |
| technician_email | string | Email du technicien |
| regie_name | string | Nom de la regie |
| regie_email | string | Email de la regie |
| confirmation_sent | boolean | TRUE si confirmation envoyee |

---

## Onglet: `employees`

Liste des employes/techniciens.

| Colonne | Type | Description |
|---------|------|-------------|
| name | string | Nom complet |
| email | string | Email professionnel (@ics.ch) |

### Donnees initiales

```
name          | email
Tanguy Moret  | tanguy@ics.ch
Marc Dubois   | marc@ics.ch
```

---

## Onglet: `reports`

Stocke les rapports d'intervention.

| Colonne | Type | Description |
|---------|------|-------------|
| report_id | string | ID unique du rapport (rpt_timestamp) |
| event_id | string | ID de l'intervention liee |
| created_at | datetime | Date de creation |
| technician_name | string | Nom du technicien |
| report_text | string | Description des travaux |
| photos_links | string | JSON array des URLs photos |
| billable_status | string | FACTURABLE, NON_FACTURABLE, A_VALIDER |
| invoice_payload | string | JSON des donnees facture |
| invoice_status | string | NOT_REQUESTED, READY, SENT |

---

## Notes importantes

1. **Ordre des colonnes:** Respecter l'ordre exact pour les operations Append
2. **Headers:** La premiere ligne doit contenir les noms de colonnes
3. **Format dates:** Toujours ISO 8601 (ex: 2025-01-27T14:30:00+01:00)
4. **Champs vides:** Utiliser "" et non pas null
5. **Booleans:** TRUE/FALSE en majuscules
