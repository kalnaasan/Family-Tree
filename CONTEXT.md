# Family Tree

A web app where a user records their family members and sees them drawn as a tree, with ancestors at the roots and descendants spreading into the crown.

## Language

**Person**:
An individual in the tree, with a name, optional gender, optional birth and death dates, and an optional photo.
_Avoid_: Member, node, relative (as a stored type)

**Parent link**:
A link from a child **Person** to one of their parents, of kind birth, adoptive or step. The only stored parent-child relation; a Person has at most two birth parents.
_Avoid_: Father/mother link, child link

**Partnership**:
An unordered link between two **Persons** who are current or former partners. A Person can have several. It never implies children; only **Parent links** do.
_Avoid_: Marriage, spouse link

**Relationship label**:
The derived name of how one **Person** relates to another (father, brother, grandfather, wife, son…). Computed from links, never stored.
_Avoid_: Relation type, role

**Half-sibling**:
A sibling who shares exactly one birth or adoptive parent with a **Person**.
_Avoid_: Step-sibling (that needs a step Parent link)

**Focus person**:
The **Person** the tree and **Relationship labels** are relative to. Defaults to the first Person created and can be changed by the user.
_Avoid_: Root, me, owner

**Tree**:
The whole set of **Persons**, **Parent links** and **Partnerships** held by one user in one browser.
_Avoid_: Family, graph

**Snapshot**:
An automatic safety copy of the **Tree** kept by the app so an earlier version can be restored. Distinct from an export, which the user saves as a file.
_Avoid_: Backup (that means the user's exported file), version
