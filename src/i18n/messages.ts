import type { Plural } from './translate.ts'

/**
 * The interface text. English is where the keys are made (spec section 13.1). Interface text lives here and nowhere
 * else; a guard test fails when a component holds a string of its own.
 */
export const en = {
  // the page
  'app.title': 'Family Tree',
  'app.settings': 'Settings',
  'app.listView': 'List view',
  'app.loadInvalid':
    'Your saved tree could not be read ({detail}). It has not been changed, and nothing will be saved until this is resolved.',
  'app.loadUnavailable':
    'Saving is not available in this browser ({detail}). Changes will be lost when you leave; export a backup to keep them.',
  'common.close': 'Close',
  'common.dismiss': 'Dismiss',
  'common.cancel': 'Cancel',
  'common.save': 'Save',

  // settings
  'settings.language': 'Language',
  'language.auto': 'Same as the browser',

  // saving
  'save.saved': 'Saved',
  'save.saving': 'Saving…',
  'save.error': 'Could not save',
  'save.readOnly': 'Read-only',
  'save.exportNow': 'Export a backup now',

  // banners
  'backupBanner.label': 'Backup reminder',
  'backupBanner.persistDenied': 'Your browser may delete this tree if it runs low on space. Export a backup to keep a copy.',
  'backupBanner.edits': {
    one: 'You have made {count} change since your last backup.',
    other: 'You have made {count} changes since your last backup.',
  },
  'backupBanner.never': 'You have not made a backup yet.',
  'backupBanner.old': 'It has been over 30 days since your last backup.',
  'backupBanner.export': 'Export a backup',
  'readOnly.message':
    'Read-only: this tree is being edited in another tab. What you see here does not update, and changes can only be made there.',
  'readOnly.takeOver': 'Take over editing',
  'readOnly.taking': 'Taking over…',

  // first run
  'empty.readOnlyTitle': 'No tree to show yet',
  'empty.readOnlyBody': 'Start the tree in the tab that is editing, or take over editing here.',
  'empty.title': 'Start your family tree',
  'empty.body':
    'Begin with one person, usually yourself. You can then add their parents, partners, siblings and children.',
  'empty.add': 'Add the first person',

  // history
  'history.group': 'History',
  'history.undo': 'Undo',
  'history.redo': 'Redo',
  'toast.undid': 'Undid: {what}',
  'toast.redid': 'Redid: {what}',
  'toast.deleted': 'Deleted {name}',
  'toast.deletedWith': 'Deleted {name}, with {parts}',
  'toast.parentLinks': { one: '{count} parent link', other: '{count} parent links' },
  'toast.bothParts': '{first} and {second}',
  'toast.partnerships': { one: '{count} partnership', other: '{count} partnerships' },
  'step.addPerson': 'Add person',
  'step.addRelation': 'Add {relation}',
  'step.editPerson': 'Edit person',
  'step.delete': 'Delete {name}',
  'step.addParentLink': 'Add parent link',
  'step.removeParentLink': 'Remove parent link',
  'step.addPartnership': 'Add partnership',
  'step.editPartnership': 'Edit partnership',
  'step.removePartnership': 'Remove partnership',
  'step.changeFocus': 'Change Focus person',
  'step.changePhoto': 'Change photo',
  'step.removePhoto': 'Remove photo',

  // words for a relative, when adding one and when moving by keyboard
  'relation.father': 'father',
  'relation.mother': 'mother',
  'relation.parent': 'parent',
  'relation.brother': 'brother',
  'relation.sister': 'sister',
  'relation.sibling': 'sibling',
  'relation.halfBrother': 'half-brother',
  'relation.halfSister': 'half-sister',
  'relation.halfSibling': 'half-sibling',
  'relation.husband': 'husband',
  'relation.wife': 'wife',
  'relation.partner': 'partner',
  'relation.exHusband': 'ex-husband',
  'relation.exWife': 'ex-wife',
  'relation.exPartner': 'ex-partner',
  'relation.son': 'son',
  'relation.daughter': 'daughter',
  'relation.child': 'child',

  // counts, shared
  'common.people': { one: '{count} person', other: '{count} people' },
  'common.photos': { one: '{count} photo', other: '{count} photos' },
  'common.checking': 'Checking…',
  'date.unknown': 'an unknown date',
  'size.bytes': '{n} bytes',
  'size.kb': '{n} KB',
  'size.mb': '{n} MB',
  'size.gb': '{n} GB',

  // settings
  'settings.storage': 'Storage',
  'settings.photos': 'Photos',
  'settings.photosUnavailable': 'Could not be read',
  'settings.photosNone': 'None',
  'settings.photosCount': { one: '{count} photo, {size}', other: '{count} photos, {size}' },
  'settings.browser': 'This browser',
  'settings.browserUsage': '{used} of {quota} used',
  'settings.browserUnreported': 'Not reported by this browser',
  'settings.safe': 'Kept safe',
  'settings.safeUnknown': 'Not asked yet',
  'settings.safeYes': 'Yes, the browser will not clear it',
  'settings.safeNo': 'No, the browser may clear it if space runs low',

  // backup and import
  'backup.title': 'Backup',
  'backup.lastBackup': 'Last backup: {when}',
  'backup.never': 'never',
  'backup.includePhotos': 'Include photos',
  'backup.export': 'Export',
  'backup.import': 'Import a file',
  'backup.fileLabel': 'Backup file to import',
  'backup.exporting': 'Exporting…',
  'backup.checkingFile': 'Checking the file…',
  'backup.replacing': 'Replacing your tree…',
  'backup.saved': 'Backup saved as {fileName}.',
  'backup.savedWithPhotos': { one: 'Backup saved as {fileName} with {count} photo.', other: 'Backup saved as {fileName} with {count} photos.' },
  'backup.photosMissing': { one: '{count} photo was not found and left out.', other: '{count} photos were not found and left out.' },
  'backup.savedAndMissing': '{saved} {missing}',
  'backup.exportFailed': 'The backup could not be created. Nothing was downloaded.',
  'backup.rejected': 'Nothing was imported. {detail}. (Rule: {rule}.)',
  'backup.rejectedUnreadable': 'Nothing was imported. That file could not be read.',
  'backup.confirmTitle': 'Replace your tree with this file?',
  'backup.confirmFile': 'The file has {people}.',
  'backup.confirmFilePhotos': 'The file has {people} and {photos}.',
  'backup.confirmTree': 'Your tree has {people}, and all of them will be replaced.',
  'backup.exportFirst': 'Export current tree first',
  'backup.replace': 'Replace my tree',
  'backup.imported': {
    one: 'Imported {count} person. Your previous tree is kept under Restore a previous version.',
    other: 'Imported {count} people. Your previous tree is kept under Restore a previous version.',
  },
  'backup.safetyCopyFailed':
    'A safety copy of your current tree could not be saved, so nothing was replaced. Export your current tree first, then try again.',
  'backup.photosNoSpace': 'There is not enough storage space left for the photos in this file, so nothing was replaced.',
  'backup.photosNotSaved': 'The photos in this file could not be saved, so nothing was replaced.',
  'backup.versionUnreadable': 'That version could not be read any more.',

  // restoring a version
  'restore.title': 'Restore a previous version',
  'restore.readOnlyNote': 'Importing and restoring are for the tab that is editing.',
  'restore.unavailable': 'Earlier versions could not be read.',
  'restore.none': 'No earlier versions yet. They are kept automatically as you work.',
  'restore.line': '{when} · {people}',
  'restore.reasonNote': '({reason})',
  'restore.reason.load': 'when the app opened',
  'restore.reason.hourly': 'while editing',
  'restore.reason.import': 'before an import',
  'restore.reason.restore': 'before a restore',
  'restore.button': 'Restore',
  'restore.buttonAria': 'Restore the version from {when}',
  'restore.groupAria': 'Restore the version from {when}?',
  'restore.question': 'Your tree has {current}; this version has {version}. Your tree is replaced, and kept as a version too.',
  'restore.confirm': 'Restore this version',
  'restore.done': 'Restored the version from {when}. Your previous tree is kept as a version too.',

  // the Person form
  'fields.firstName': 'First name',
  'fields.lastName': 'Last name (optional)',
  'fields.gender': 'Gender',
  'gender.female': 'Female',
  'gender.male': 'Male',
  'gender.other': 'Other',
  'gender.unknown': 'Not specified',
  'fields.born': 'Born (optional)',
  'fields.died': 'Died (optional)',
  'fields.datePlaceholder': 'YYYY-MM-DD',
  'fields.deceased': 'Deceased',

  // adding a relative
  'addForm.back': 'Back',
  'addForm.parentPartnership': 'How is the new parent connected to {name}?',
  'addForm.partnerCurrent': 'Current partner',
  'addForm.partnerEnded': 'Former partner (ended)',
  'addForm.partnerNone': 'Not partners',
  'addForm.siblingParents': 'Which parents do they share?',
  'addForm.sharesBoth': 'Both: {first} and {second}',
  'addForm.sharesOnly': 'Only {name} (half-sibling)',
  'addForm.otherParent': 'Who is the other parent?',
  'addForm.otherCurrent': '{name} (current partner)',
  'addForm.otherFormer': '{name} (former partner)',
  'addForm.otherNobody': 'Nobody / not recorded',
  'addForm.partnerStatus': 'Is this partnership current or ended?',
  'addForm.statusCurrent': 'Current',
  'addForm.statusEnded': 'Ended',
  'addForm.submit': 'Add {relation}',
  'addForm.failure': 'This could not be added. ({detail})',
  'addRelative.blockedParents': '{name} already has two birth parents, so a third cannot be added.',
  'preview.title': 'This will create:',
  'preview.newPerson': 'The new person',
  'preview.relationOf': '{who}, {relation} of {name}',
  'preview.relationOfTwo': '{who}, {relation} of {name} and {other}',
  'preview.noPartnership': 'No partnership with {name}',
  'preview.partnershipCurrent': 'A current partnership',
  'preview.partnershipEnded': 'An ended partnership',
  'preview.partnershipCurrentWith': 'A current partnership with {name}',
  'preview.partnershipEndedWith': 'An ended partnership with {name}',
  'preview.newParent': 'A new parent, "{name}", of both (you can rename them)',
  'preview.halfSibling': 'Half-sibling: shares only {parent} as parent',
  'preview.sameParent': 'Same parent: {name}',
  'preview.sameParents': 'Same parents: {first} and {second}',
  'person.unnamedParent': 'Unnamed parent',

  // moving by keyboard
  'nav.nobodySelected': 'Nobody is selected',
  'nav.noParents': '{name} has no recorded parents',
  'nav.noChildren': '{name} has no recorded children',
  'nav.noSiblings': '{name} has no recorded siblings',
  'nav.noPartners': '{name} has no recorded partners',
  'nav.moved': '{target}, {word} of {relativeTo}',
  'nav.movedChildren': {
    one: '{target}, {word} of {relativeTo}, {count} child',
    other: '{target}, {word} of {relativeTo}, {count} children',
  },

  // photos
  'photo.title': 'Photo',
  'photo.choose': 'Choose photo',
  'photo.change': 'Change photo',
  'photo.remove': 'Remove photo',
  'photo.fileLabel': 'Photo file',
  'photo.unreadable': 'That photo could not be read. It may be damaged; try another one.',
  'photo.empty': 'That file is empty.',
  'photo.tooBig': 'That file is {size}. Photos can be up to 25 MB.',
  'photo.heic': 'That is a HEIC photo, which browsers cannot open. Convert it to JPEG first.',
  'photo.unsupported': 'That file is not a JPEG, PNG or WebP photo.',
  'crop.title': 'Crop photo',
  'crop.hint': 'Drag the photo, or use the arrow keys, to place it. Zoom with the slider, or with + and −.',
  'crop.position': 'Photo position',
  'crop.zoom': 'Zoom',
  'crop.error': 'The photo could not be prepared. Try another one.',
  'crop.saving': 'Saving…',
  'crop.use': 'Use this photo',
  'photo.noSpace': 'There is not enough storage space left for this photo, so it was not added. Everything else is saved.',
  'photo.notSaved': 'The photo could not be saved, so it was not added. Everything else is saved.',

  // the tree
  'tree.label': 'Family tree',
  'tree.hint':
    'Arrow keys move to a parent, child or sibling. P moves to a partner. Enter opens a person. F makes them the Focus person. Home returns to the Focus person. Plus and minus zoom, 0 shows the whole tree, Shift with an arrow pans.',
  'tree.zoomIn': 'Zoom in',
  'tree.zoomOut': 'Zoom out',
  'tree.fit': 'Show whole tree',
  'tree.backToFocus': 'Back to Focus person',
  'tree.thisPerson': 'This person',
  'tree.nowFocus': '{name} is now the Focus person',
  'tree.homeFocus': '{name}, Focus person',
  'tree.noFocus': 'No Focus person',
  'tree.layingOut': 'Laying out your tree…',
  'tree.limit': 'This tree has {count} people or more, the most the app is made for. It is drawn with less detail, and may be slow.',

  // search
  'search.label': 'Search people',
  'search.resultsLabel': 'Search results',
  'search.none': 'No one found',
  'search.showing': { one: 'Showing {count} person', other: 'Showing {count} people' },
  'search.results': { one: '{count} result', other: '{count} results' },
  'search.more': '{count} more: keep typing to narrow it down',

  // people
  'person.focus': 'Focus person',
  'person.deceased': 'deceased',
  'person.born': 'born {year}',
  'person.died': 'died {year}',
  'person.errorFirstName': 'Enter a first name',
  'person.dateHelp': 'Use YYYY, YYYY-MM or YYYY-MM-DD',

  // the list view
  'list.title': 'Family list',
  'list.with': 'with {names}',
  'list.former': '{name} (former)',
  'list.alsoChild': '{name} · also a child here, listed under {home}',
  'list.expand': "Expand {name}'s family",
  'list.collapse': "Collapse {name}'s family",
  'list.noMatch': 'No one matches “{query}”.',

  // the Person panel
  'panel.label': 'Person details',
  'panel.addTitle': 'Add {relation} of {name}',
  'panel.addRelative': 'Add relative',
  'panel.details': 'Details',
  'panel.group.parents': 'Parents',
  'panel.group.partners': 'Partners',
  'panel.group.siblings': 'Siblings',
  'panel.group.children': 'Children',
  'panel.none': 'None recorded',
  'panel.addAria': 'Add {relation}',
  'panel.addButton': '+ {relation}',
  'panel.noteFormer': 'former',
  'panel.noteHalf': 'half',
  'panel.edit': 'Edit details',
  'panel.makeFocus': 'Make Focus person',
  'panel.delete': 'Delete {name}',
  'panel.collapseSheet': 'Collapse sheet',
  'panel.expandSheet': 'Expand sheet',
} satisfies Record<string, string | Plural>

export type MessageKey = keyof typeof en

type ArabicOf<T> = { [K in keyof T]: T[K] extends string ? string : Required<Plural> }

/**
 * A draft in Modern Standard Arabic; the owner reviews every string before Arabic is offered (spec section 13.8).
 * While "Arabic interface text" is open Arabic may lack keys (English is shown); that ticket makes it complete.
 */
export const ar: Partial<ArabicOf<typeof en>> = {
  'settings.language': 'اللغة',
  'language.auto': 'مثل المتصفح',
}

export const DICTIONARIES = { en, ar }
