# Evolve development requesters in place

Lab 3 renames and evolves the existing RequesterUser records into Users while preserving their primary keys, rather than creating a second identity table and copying records. Keeping the existing identifiers preserves Ticket and Attachment ownership through the migration with fewer foreign-key rewrite and data-loss risks; the obsolete department field and Development Requester selector are removed as authentication becomes the only identity source.
