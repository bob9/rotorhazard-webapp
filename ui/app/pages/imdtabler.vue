<script setup lang="ts">
/**
 * IMDTabler (the classic /imdtabler page): rates a set of video frequencies for
 * intermodulation interference. The table itself comes from IMDTabler.jar on the timer.
 */
const { t } = useI18n()
const rh = useRH()
const { info } = useServerInfo()
useHead({ title: 'IMDTabler' })

const available = computed(() => info.value?.imdtabler !== false)
const freqs = ref('')
const table = ref<string | null>(null)
const version = ref('')
const loading = ref(false)

rh.on('imdtabler_data', (d: any) => {
  loading.value = false
  if (d?.version_str) version.value = d.version_str
  if (typeof d?.freq_list === 'string') freqs.value = d.freq_list
  table.value = d?.table_data || null
})
// starts with the timer's current frequencies
onMounted(() => {
  if (available.value) {
    loading.value = true
    rh.refresh(['imdtabler_page'])
  }
})

function view(list = freqs.value) {
  freqs.value = list
  loading.value = true
  rh.emit('imdtabler_update_freqs', { freq_list: list })
}

const PRESETS = [
  { name: 'Raceband', freqs: '5658 5695 5732 5769 5806 5843 5880 5917' },
  { name: 'IMD 6C', freqs: '5658 5695 5760 5800 5880 5917' },
  { name: 'ET5', freqs: '5665 5725 5820 5860 5945' },
  { name: 'ET5A', freqs: '5665 5752 5800 5866 5905' },
  { name: 'ETBest6', freqs: '5645 5685 5760 5805 5905 5945' },
  { name: 'ET6minus1', freqs: '5645 5685 5760 5905 5945' },
  { name: 'Racebnd4', freqs: '5658 5732 5843 5917' }
]
const tooFew = computed(() => freqs.value.replace(/,/g, ' ').split(/\s+/).filter(Boolean).length < 3)
</script>

<template>
  <UDashboardPanel id="imdtabler">
    <template #header>
      <UDashboardNavbar title="IMDTabler">
        <template #leading>
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" to="/timer" :aria-label="t('Timer')" />
        </template>
        <template #right>
          <RhBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8">
        <p class="max-w-3xl text-sm text-muted">
          {{ t('Compare frequency sets for intermodulation. Enter three or more frequencies in MHz, or start from a known set.') }}
        </p>

        <UEmpty
          v-if="!available"
          icon="i-lucide-coffee"
          :title="t('IMDTabler needs Java on the timer')"
          :description="t('Install a Java runtime on the timer computer and restart RotorHazard to use IMDTabler.')"
          variant="naked"
        />
        <template v-else>
          <RhGroup :title="t('Frequencies')">
            <RhRow stacked>
              <div class="flex w-full flex-col gap-3 sm:flex-row">
                <UInput v-model="freqs" class="flex-1 font-mono" size="lg" placeholder="5658 5695 5732 5769" :aria-label="t('Frequencies')" @keydown.enter="view()" />
                <UButton size="lg" icon="i-lucide-table" :label="t('View')" :loading="loading" :disabled="tooFew" class="justify-center" @click="view()" />
              </div>
            </RhRow>
            <RhRow :label="t('Known sets')" stacked>
              <div class="flex flex-wrap gap-2">
                <UButton v-for="p in PRESETS" :key="p.name" color="neutral" variant="soft" size="sm" :label="p.name" @click="view(p.freqs)" />
              </div>
            </RhRow>
          </RhGroup>

          <section v-if="table" class="space-y-2">
            <h2 class="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
              {{ t('Hover the mouse cursor over table cells for information') }}
            </h2>
            <!-- table markup comes from IMDTabler.jar on the timer -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <UCard :ui="{ body: 'overflow-x-auto' }"><div class="rh-imd" v-html="table" /></UCard>
          </section>
          <p v-else-if="!loading && tooFew" class="px-1 text-sm text-dimmed">
            {{ t('Enter at least three frequencies to see a table.') }}
          </p>
          <p v-if="version" class="px-1 text-xs text-dimmed">
            {{ version }}
          </p>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
