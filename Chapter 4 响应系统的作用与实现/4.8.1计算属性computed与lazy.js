// 使用 WeakMap 代替 Set 作为桶的数据结构
// WeakMap 与 Map 的区别有2点：
// 1.WeakMap 只接受对象作为键名（null除外）
// 2.WeakMap 的键名所指向的对象，不计入垃圾回收机制
// https://es6.ruanyifeng.com/#docs/set-map#WeakMap

// 存储副作用函数的桶
const bucket = new WeakMap()

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
// effect 栈
const effectStack = []

const effect = (fn, options = {}) => {
    const effectFn = () => {
        // 调用 cleanup 函数完成清除工作
        cleanup(effectFn)

        // 当调用 effect 注册副作用函数时，将副作用函数赋值给 activeEffect
        activeEffect = effectFn

        // 在调用副作用函数之前将当前副作用函数压入栈中
        effectStack.push(effectFn)
        
        // 将 fn 的执行结果存储到 res 中
        const res = fn() // 新增

        // 在当前副作用函数执行完毕后，将当前副作用函数弹出栈，并把 activeEffect 还原为之前的值
        effectStack.pop() 
        activeEffect = effectStack[effectStack.length - 1]

        // console.log('执行完包装副作用函数，原始副作用函数fn=> ', fn)

        // 将 res 作为 effectFn 的执行结果返回值
        return res // 新增
    }

    // 将 options 挂在到 effectFn 上
    effectFn.options = options

    // activeEffect.deps 用来存储所有与该副作用函数相关联的依赖集合
    effectFn.deps = []

    // 只有非 lazy 的时候，才执行
    if (!options.lazy) { // 新增
        // console.log('注册时执行副作用函数，原始副作用函数fn=> ', fn)
        // 执行副作用函数
        effectFn()
    }

    // 将副作用函数作为返回值返回
    return effectFn // 新增
}

function cleanup (effectFn) {
    // 遍历 effectFn.deps 数组
    for (let i = 0; i < effectFn.deps.length; i++) {
        // deps 是依赖集合
        const deps = effectFn.deps[i]
        // 将 effectFn 从依赖集合中移除
        deps.delete(effectFn)
    }

    // 最后需要重置 effectFn.deps 数组
    effectFn.deps.length = 0
}

// 计算属性
function computed (getter) {
    // value 用来缓存上一次计算的值
    let value

    // dirty 标志，用来标识是否需要重新计算值，为 true 则意味着脏，需要计算
    let dirty = true

    // 把 getter 作为副作用函数，创建一个 lazy 的 effect
    const effectFn = effect(getter, {
        lazy: true, // 注册时不执行。
        scheduler () { // 执行时不直接调用副作用函数而是调用 scheduler(fn)。（对属性进行赋值操作时，进入 set 的 trigger 逻辑时执行 scheduler(fn)）
            if (!dirty) {
                dirty = true
                // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数触发响应
                trigger(obj, 'value')
            }
        }
    })

    const obj = {
        // 当读取 value 时才执行 effectFn
        get value () {
            if (dirty) {
                value = effectFn()
                dirty = false
            }

            // 当读取 value 时，手动调用 track 函数进行追踪
            track(obj, 'value')

            return value
        }
    }

    return obj
}

// 原始数据
const data = { foo: 1, bar: 2 }

const obj = new Proxy(data, {
    // 拦截读取操作
    get (target, key) {
        // 将副作用函数 activeEffect 添加到存储副作用函数的桶中
        track(target, key)

        // 返回属性值
        return target[key]
    },

    // 拦截设置操作
    set (target, key, newVal) {
        // 设置属性值
        target[key] = newVal

        // 把副作用函数从桶里取出并执行
        trigger(target, key)
    }
})

// 在 get 拦截函数内调用 track 函数追踪变化
function track (target, key) {
    // 没有 activeEffect ，直接 return
    if (!activeEffect) return

    let depsMap = bucket.get(target)

    if (!depsMap) {
        bucket.set(target, (depsMap = new Map()))
    }

    let deps = depsMap.get(key)
    if (!deps) {
        depsMap.set(key, (deps = new Set()))
    }

    // 把当前激活的副作用函数添加到依赖集合 deps 中
    deps.add(activeEffect)

    // deps 就是一个与当前副作用函数存在联系的依赖集合
    // 将其添加到 activeEffect.deps 数组中
    activeEffect.deps.push(deps)
}

// 在 set 拦截函数内调用 trigger 函数触发变化
function trigger (target, key) {
    const depsMap = bucket.get(target)
    if (!depsMap) return

    const effects = depsMap.get(key)

    const effectsToRun = new Set()
    effects && effects.forEach(effectFn => {
        // 如果 trigger 触发执行的副作用函数于当前正在执行的副作用函数相同，则不触发执行
        if (effectFn !== activeEffect) {
            effectsToRun.add(effectFn)
        }
    })
    effectsToRun.forEach(effectFn => {
        // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
        if (effectFn?.options?.scheduler) { // 新增
            effectFn.options.scheduler(effectFn) // 新增
        } else {
            effectFn()
        }
    })
}

// 定义一个任务队列
const jobQueue = new Set()
// 使用 Promise.resolve() 创建一个 promise 实例，我们用它将一个任务添加到微任务队列
const p = Promise.resolve()

// 一个标志代表是否正在刷新队列
let isFlushing = false
function flushJob () {
    // 如果队列正在刷新，则什么都不做
    if (isFlushing) return
    // 设置为 true，代表正在刷新
    isFlushing = true

    // 在微任务队列中刷新 jobQueue 队列
    p.then(() => {
        jobQueue.forEach(job => job())
    }).finally(() => {
        // 结束后重置 isFlushing
        isFlushing = false
    })
}



const sumRes = computed(() => obj.foo + obj.bar)
effect(function abc () {
    console.log(sumRes.value)
})

obj.foo = 10 

/**
 * computed 方法实现概括：
 * 1. 内部利用 effect 注册传入的副作用函数，保存返回值为 effectFn （包装后的副作用函数）
 * 2. 返回一个对象 obj，其有一个 value 属性，是只定义了 getter 的存取器属性，因此只读（犀牛书6版132页）
 * 3. 当读取计算属性时，就会执行 obj.value 的 getter 方法继而执行副作用函数 effectFn
 * 
 * 计算属性执行流程：
 * 执行 computed(() => obj.foo + obj.bar)
 * -- 进入 computed 函数体
 * ---- 执行 effect 注册副作用函数并保存返回值为 effectFn。执行参数为 lazy:true，scheduler
 * ------ 包装副作用函数：return 原始副作用函数执行后的返回值
 * ------ lazy 为 true 不执行包装副作用函数，return 包装副作用函数
 * ---- 定义 obj 对象作为 computed 方法的返回值。obj.value 是一个存取器属性，只声明了 get 因此计算后的值只能读，不能赋值
 * 
 * 
 * 
 * 执行 console.log(sumRes.value)
 * 执行 sumRes.value 的 getter
 * -- 执行包装副作用函数 effectFn
 * ---- clearnup()
 * ---- res=fn() （fn 就是原始副作用函数 () => obj.foo + obj.bar）
 * ------ 进入 obj.foo 的代理 get，把副作用函数收集到依赖集合
 * ------ 进入 obj.bar 的代理 get，把副作用函数收集到依赖集合
 * ---- return res 获取到了计算后的值
 * 
 * 
 * 
 * 执行 effect(function abc () {console.log(sumRes.value)}) 流程：
 * -- 1 进入 effect 函数体注册副作用函数
 * ---- 2 执行 effectFn()
 * ------ 3.1 activeEffect = 包装后的 abc 函数
 * ------ 3.2 effectStack.push(effectFn)，effectStack 栈+1 长度为1
 * ------ 3.3 执行 const res = fn() 原始副作用函数 console.log(sumRes.value)
 * -------- 4 进入计算属性 obj value 的 getter 方法
 * ---------- 5 执行 value = effectFn()，此 effectFn 是 () => obj.foo + obj.bar 的包装副作用函数
 * ------------ 6 effectStack.push(effectFn)，effectStack 栈+1 长度为2
 * ------------ 6 执行 res=fn() 原始副作用函数 () => obj.foo + obj.bar
 * -------------- 7 进入 obj.foo 的代理 get，收集到依赖集合，返回 obj.foo 值
 * -------------- 7 进入 obj.bar 的代理 get，收集到依赖集合，返回 obj.bar 值
 * ------------ 6 return res
 * ---------- 5 track(obj, 'value')
 * ------------ 6 执行 if (!activeEffect) return，此时 activeEffect 是有值的（见步骤3.1）
 * ------------ 6 执行完 track，此时 bucket.get(obj).get('value') set 集合加入了包装后的 abc 副作用函数
 * ---------- 5 return value，getter 方法执行结束
 * ------ 3 effectStack.pop()
 * ------ 3 activeEffect = effectStack[effectStack.length - 1]
 * ------ 3 return res
 * ------ 3 effectFn 方法体执行结束
 * ---- 2 return effectFn
 * -- 1 effect 注册副作用函数结束
 * 
 * 所以当 obj.foo++ 执行时，
 * 运行了其依赖集合中副作用函数，此副作用函数在 computed 方法体内注册，
 * 注册时有 scheduler 调度器，所以 trigger 执行其 scheduler，
 * 调度器内主动 trigger 了计算属性依赖的副作用函数集合，即 abc 的包裹副作用函数
 */